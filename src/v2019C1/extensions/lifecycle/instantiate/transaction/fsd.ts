import { nameCreatedSharedElements } from './name-created-shared-elements'
import { resolveTargetStructure } from './resolve-target-structure'

import { throwDialecteError } from '@dialecte/core'

import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { readSatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { resolveContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import {
	cloneFunctionCategories,
	placedFunctionTag,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import { landPrimaries } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { FsdParams, FsdResult } from './fsd.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

/**
 * Instantiate the Function carried by an FSD into a target document.
 *
 * Clones the function subtree together with its type closure under
 * `targetParent` (`transplant.deep`), then writes the identity the scenario places with: a new instance stamps
 * lineage (`identity.writeIdentity`) so each cloned element records its FSD counterpart as its `templateUuid`
 * while receiving a fresh `uuid`; a fork keeps the file's uuids.
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
 * Returns the instantiated root ref (retagged if applicable) and the clone mappings of
 * everything the operation cloned, so a consumer can drive follow-up rules
 * against the fresh instance without re-querying by templateUuid.
 */
export async function fsd(tx: Core.Transaction<Config>, params: FsdParams): Promise<FsdResult> {
	const { sourceQuery, functionRef, overrides, keepNameTypesFrom } = params
	const policy = scenarioPolicy({ scenario: params.scenario ?? 'instantiate' })

	// where the function lands: where the consumer started, or — started above the level the
	// function was made for — on the level its template says, the missing levels created
	const landing = params.resolvePlacement
		? await landOnTemplateLevel(tx, { ...params, matchKey: policy.matchKey })
		: { targetParent: params.targetParent, cloneMappings: [], redirectMappings: [] }
	const { targetParent } = landing

	// A function placed under a (Sub)Function is, per schema, a SubFunction.
	const retagRoot =
		placedFunctionTag(targetParent) === 'SubFunction'
			? ({ from: 'Function', to: 'SubFunction' } as const)
			: undefined

	const { cloneMappings: functionMappings } = await deep(tx, {
		sourceQuery,
		ref: functionRef,
		targetParent,
		retagRoot,
		withTypes: { keepNameFrom: keepNameTypesFrom },
	})

	// An FSD also carries the FunctionCategory classification that references the
	// function; clone it at its structural level in the target project. The target
	// structure is resolved from `targetParent` (Bay / VoltageLevel / Substation).
	const structure = await resolveTargetStructure(tx, targetParent)
	const { cloneMappings: categoryMappings, redirectMappings } = await cloneFunctionCategories(tx, {
		sourceQuery,
		functionRef,
		structure,
		decisionMappings: params.decisionMappings,
		matchKey: policy.matchKey,
	})

	// external cross-cutting satellites (Variable / BehaviorDescription) that apply
	// to any element in the function subtree also travel with it, one of each per instance
	// what their references may name: the function placed
	const scope = await resolveContributionScope(sourceQuery, { roots: [functionRef] })
	const index = await readSatelliteIndex(sourceQuery)
	const applied = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: functionRef,
		structure,
		bumpsCollisions: policy.bumpsCollisions,
		scope,
		index,
	})

	const allMappings = [
		...landing.cloneMappings,
		...functionMappings,
		...categoryMappings,
		...applied.cloneMappings,
	]

	// the identity the scenario places with: template lineage stamped onto a fresh instance and the cloned uuid
	// references (e.g. FunctionCatRef -> cloned Function) repointed onto the fresh uuids, or the file's uuids kept
	await finalizeClonedIdentity(tx, {
		cloneMappings: allMappings,
		mode: policy.placementIdentity,
		redirectMappings: [...landing.redirectMappings, ...redirectMappings],
	})

	// a shared element created here (no project element to map onto) is named at its structural level
	async function placementStructure(): Promise<TargetStructure> {
		return structure
	}
	await nameCreatedSharedElements(tx, {
		sourceQuery,
		cloneMappings: categoryMappings,
		resolveStructure: placementStructure,
		decisionMappings: params.decisionMappings,
	})

	const rootMapping = functionMappings.find((mapping) => mapping.source.id === functionRef.id)
	if (!rootMapping) {
		throwDialecteError('ELEMENT_NOT_FOUND', {
			detail: `instantiate.fsd: cloned root not found for ${functionRef.tagName}#${functionRef.id}`,
			ref: functionRef,
		})
	}

	// The placed root is a Function, or a SubFunction when `retagRoot` demoted it
	// under a (Sub)Function parent — keep that union visible to callers.
	const instantiatedRef = rootMapping.target as Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>

	// validate the placed function against its parent context; apply any user edits
	// then auto-resolve a name collision among siblings (schema constraint)
	if (policy.bumpsCollisions) {
		await placeUniquely(tx, {
			ref: instantiatedRef,
			parentRef: targetParent,
			overrides: overrides?.get(functionRef.id),
		})
	}
	// a function placed as part of a larger template carries that template's provenance, not its own
	if (policy.writesProvenance && !params.partOfTemplate) {
		await writeProvenance(tx, {
			sourceQuery,
			target: { anchor: 'function', root: instantiatedRef },
		})
	}

	return { functionRef: instantiatedRef, cloneMappings: allMappings }
}

/**
 * Resolve where an FSD's function lands. Started at or below the level it was made for, it lands
 * where the consumer started. Started above it, it lands on the level its template says
 * ({@link landPrimaries}).
 */
async function landOnTemplateLevel(
	tx: Core.Transaction<Config>,
	params: FsdParams & { matchKey: MatchKey },
): Promise<{
	targetParent: Scl.Ref<Scl.ElementsOf>
	cloneMappings: Scl.CloneMapping[]
	redirectMappings: RedirectMapping[]
}> {
	const { sourceQuery, functionRef, targetParent, decisionMappings } = params

	const landing = await landPrimaries(tx, {
		sourceQuery,
		primaryRefs: [functionRef],
		anchor: targetParent,
		decisionMappings,
		operation: 'instantiate.fsd',
		matchKey: params.matchKey,
	})
	if (!landing) return { targetParent, cloneMappings: [], redirectMappings: [] }

	return {
		targetParent: landing.frameIndex.get(landing.deepestLevelId) ?? targetParent,
		cloneMappings: landing.cloneMappings,
		redirectMappings: landing.redirectMappings,
	}
}
