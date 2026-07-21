import { resolveTargetStructure } from './resolve-target-structure'

import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { cloneApplicationContent } from '@/v2019C1/extensions/lifecycle/layers/application'
import {
	findMissingReferencedRecords,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { AsdParams, AsdResult } from './asd.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Instantiate the Application carried by an ASD into a target document.
 *
 * Clones the application-layer content (Application + its Functions, categories and
 * satellites, with type closure) under the structure resolved from `targetParent`
 * (`layers/application`), then stamps instance lineage (`identity.writeIdentity` in
 * `stamp-template` mode) on every cloned element.
 *
 * The clone's uuid references are remapped by the `afterDeepClone` hook. The
 * instantiation provenance link (`ApplicationSclRef` -> `SclFileReference` back to
 * the ASD) is written on the cloned root by `reference.writeProvenance`; SET policy
 * (naming, assign-to-application) is applied by consumer hooks, not here.
 *
 * Returns the instantiated Application ref, its composed Function roots, and the full
 * source -> clone mappings, so a consumer can drive follow-up rules against the fresh
 * instance without re-querying by templateUuid.
 */
export async function asd(tx: Core.Transaction<Config>, params: AsdParams): Promise<AsdResult> {
	const { sourceQuery, applicationRef, targetParent, overrides } = params

	const structure = await resolveTargetStructure(tx, targetParent)

	// capture the composed Function source refs BEFORE cloning (they are "missing" only
	// until placed) so their clones can be collision-checked at their structural level
	const composedFunctionRefs = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'FunctionRef',
		targetTagName: 'Function',
	})

	const mappings = await cloneApplicationContent(tx, {
		sourceQuery,
		applicationRef,
		structure,
	})

	// external cross-cutting satellites (Variable / BehaviorDescription) applying to
	// any element in the Application subtree travel with it
	const appliedMappings = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: applicationRef,
		structure,
		strip: false,
	})

	await writeIdentity(tx, { mappings: [...mappings, ...appliedMappings], mode: 'stamp-template' })

	// resolve a name collision for each placed composed Function at its own structural
	// level (a repeated instantiate would otherwise duplicate a Function name in the Bay)
	for (const functionRef of composedFunctionRefs) {
		const functionMapping = mappings.find((mapping) => mapping.source.id === functionRef.id)
		if (!functionMapping) continue
		const functionParent = await resolveStructureRef(sourceQuery, functionRef, structure)
		await resolvePlacementCollision(tx, {
			ref: functionMapping.target,
			parentRef: functionParent,
			overrides: overrides?.get(functionRef.id),
		})
	}

	const rootMapping = mappings.find((mapping) => mapping.source.id === applicationRef.id)
	if (!rootMapping) {
		throw new Error(`instantiate.asd: cloned Application not found for ${applicationRef.id}`)
	}

	// validate the placed application against its parent context (resolved at the
	// application's own structural level, not the anchor): apply any user edits then
	// auto-resolve a name collision among siblings (schema constraint)
	const applicationParent = await resolveStructureRef(sourceQuery, applicationRef, structure)
	await resolvePlacementCollision(tx, {
		ref: rootMapping.target,
		parentRef: applicationParent,
		overrides: overrides?.get(applicationRef.id),
	})
	await writeProvenance(tx, {
		sourceQuery,
		targetRoot: rootMapping.target,
		fileType: 'ASD',
	})

	const composedFunctionInstanceRefs = composedFunctionRefs
		.map((functionRef) => mappings.find((mapping) => mapping.source.id === functionRef.id)?.target)
		.filter((target): target is Scl.Ref<Scl.ElementsOf> => Boolean(target)) as (
		| Scl.Ref<'Function'>
		| Scl.Ref<'SubFunction'>
	)[]

	return {
		applicationRef: rootMapping.target as Scl.Ref<'Application'>,
		composedFunctionRefs: composedFunctionInstanceRefs,
		recordMappings: mappings,
	}
}
