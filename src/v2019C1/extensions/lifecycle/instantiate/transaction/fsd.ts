import { resolveTargetStructure } from './resolve-target-structure'

import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { cloneFunctionCategories } from '@/v2019C1/extensions/lifecycle/layers/function'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/satellites/clone-applied-satellites'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { FsdParams } from './fsd.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Instantiate the Function carried by an FSD into a target document.
 *
 * Clones the function subtree together with its type closure under
 * `targetParent` (`transplant.deep`), then stamps instance lineage
 * (`identity.writeIdentity`) so each cloned element records its FSD counterpart
 * as its `templateUuid` while receiving a fresh `uuid`.
 *
 * The clone's uuid references are remapped by the `afterDeepClone` hook. The
 * instantiation provenance link (`FunctionSclRef` -> `SclFileReference` back to
 * the FSD) is written on the cloned root by `reference.writeProvenance`; SET
 * policy (naming, application assignment) is applied by consumer hooks, not here.
 */
export async function fsd(tx: Core.Transaction<Config>, params: FsdParams): Promise<void> {
	const { sourceQuery, functionRef, targetParent } = params

	const { recordMappings } = await deep(tx, {
		sourceQuery,
		ref: functionRef,
		targetParent,
		strip: false,
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

	await writeIdentity(tx, {
		mappings: [...recordMappings, ...categoryMappings, ...appliedMappings],
		mode: 'stamp-template',
	})

	const rootMapping = recordMappings.find((mapping) => mapping.source.id === functionRef.id)
	if (rootMapping) {
		await writeProvenance(tx, {
			sourceQuery,
			targetRoot: rootMapping.target,
			fileType: 'FSD',
		})
	}
}
