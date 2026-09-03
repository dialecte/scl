import { resolveTargetStructure } from './resolve-target-structure'

import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { cloneFunctionCategories } from '@/v2019C1/extensions/lifecycle/layers/function'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { applyUuidRemap, writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { FsdParams, FsdResult } from './fsd.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Instantiate the Function carried by an FSD into a target document.
 *
 * Clones the function subtree together with its type closure under
 * `targetParent` (`transplant.deep`), then stamps instance lineage
 * (`identity.writeIdentity`) so each cloned element records its FSD counterpart
 * as its `templateUuid` while receiving a fresh `uuid`.
 *
 * When the target parent is itself a `Function`/`SubFunction`, the placed root is
 * retagged to `SubFunction` (schema: a function nested in a function is a
 * subfunction) — the inverse of the `SubFunction -> Function` promotion applied
 * on extraction.
 *
 * The clone's uuid references are repointed by `reference.applyUuidRemap` over the
 * combined mappings. The instantiation provenance link (`FunctionSclRef` -> `SclFileReference` back to
 * the FSD) is written on the cloned root by `reference.writeProvenance`; SET
 * policy (naming, application assignment) is applied by consumer hooks, not here.
 *
 * Returns the instantiated root ref (retagged if applicable) and the full
 * source -> clone record mappings, so a consumer can drive follow-up rules
 * against the fresh instance without re-querying by templateUuid.
 */
export async function fsd(tx: Core.Transaction<Config>, params: FsdParams): Promise<FsdResult> {
	const { sourceQuery, functionRef, targetParent, overrides, keepNameTypesFrom } = params

	// A function placed under a (Sub)Function is, per schema, a SubFunction.
	const retagRoot =
		targetParent.tagName === 'Function' || targetParent.tagName === 'SubFunction'
			? ({ from: 'Function', to: 'SubFunction' } as const)
			: undefined

	const { recordMappings } = await deep(tx, {
		sourceQuery,
		ref: functionRef,
		targetParent,
		strip: false,
		retagRoot,
		withTypes: { keepNameFrom: keepNameTypesFrom },
	})

	// An FSD also carries the FunctionCategory classification that references the
	// function; clone it at its structural level in the target project. The target
	// structure is resolved from `targetParent` (Bay / VoltageLevel / Substation).
	const structure = await resolveTargetStructure(tx, targetParent)
	const categoryMappings = await cloneFunctionCategories(tx, {
		sourceQuery,
		functionRef,
		structure,
		stripCategoriesUuid: false,
	})

	// external cross-cutting satellites (Variable / BehaviorDescription) that apply
	// to any element in the function subtree also travel with it
	const appliedMappings = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: functionRef,
		structure,
		strip: false,
	})

	const allMappings = [...recordMappings, ...categoryMappings, ...appliedMappings]

	// Repoint cloned uuid refs (e.g. FunctionCatRef -> cloned Function) before lineage
	// stamping and provenance read the cloned refs.
	await applyUuidRemap(tx, { mappings: allMappings })

	await writeIdentity(tx, {
		mappings: allMappings,
		mode: 'stamp-template',
	})

	const rootMapping = recordMappings.find((mapping) => mapping.source.id === functionRef.id)
	if (!rootMapping) {
		throw new Error(
			`instantiate.fsd: cloned root not found for ${functionRef.tagName}#${functionRef.id}`,
		)
	}

	// The placed root is a Function, or a SubFunction when `retagRoot` demoted it
	// under a (Sub)Function parent — keep that union visible to callers.
	const instantiatedRef = rootMapping.target as Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>

	// validate the placed function against its parent context; apply any user edits
	// then auto-resolve a name collision among siblings (schema constraint)
	await resolvePlacementCollision(tx, {
		ref: instantiatedRef,
		parentRef: targetParent,
		overrides: overrides?.get(functionRef.id),
	})
	await writeProvenance(tx, {
		sourceQuery,
		targetRoot: instantiatedRef,
		fileType: 'FSD',
	})

	return { functionRef: instantiatedRef, recordMappings }
}
