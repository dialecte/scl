import { ALWAYS_OMIT } from '../shared/omit-filters'

import {
	cloneAllReferencedTargets,
	findMissingReferencedRecords,
	cloneTree,
	cloneFunction,
	cloneFunctionCategories,
	resolveStructureRef,
	createAncestryResolver,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Scl, Config } from '@/v2019C1/config'
import type { TemplateStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * ASD content brick: clones an Application and all its satellites (Functions,
 * AllocationRoles, BehaviorDescriptions) into the target template structure.
 *
 * UUID remapping is handled by afterDeepClone hook via cumulativeCloneMappings.
 * Reusable by ISD extraction as the inner Application clone step.
 */
export async function cloneApplicationContent(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		structure: TemplateStructure
	},
): Promise<void> {
	const { sourceQuery, applicationRef, structure } = params

	// Source record id -> cloned target ref, accumulated as functions are cloned, so
	// step 3's satellites can be placed back under their owning function.
	const cloneIndex = new Map<string, Scl.Ref<Scl.ElementsOf>>()

	// 1. Functions: resolve structural parent per function, clone tree + data model
	const missingFunctions = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'FunctionRef',
		targetTagName: 'Function',
	})
	for (const ref of missingFunctions) {
		const targetParentRef = await resolveStructureRef(sourceQuery, ref, structure)
		const mappings = await cloneFunction(tx, {
			sourceQuery,
			functionRef: ref,
			targetParentRef,
			omit: ALWAYS_OMIT,
		})
		for (const mapping of mappings) {
			if (mapping.source.id) cloneIndex.set(mapping.source.id, mapping.target)
		}
	}

	// 2. FunctionCategories: clone at source-side structural level
	for (const ref of missingFunctions) {
		await cloneFunctionCategories(tx, {
			sourceQuery,
			functionRef: ref,
			structure,
			stripCategoriesUuid: false,
		})
	}

	// 3. All other referenced targets - derived from UUID_REFERENCE_PAIRS and DESCENDANTS.
	// Each is placed by mirroring its source hierarchy (under its owning function when it
	// has one), not flattened to Substation.
	const REFS_ALREADY_HANDLED = new Set(['FunctionRef', 'FunctionCategoryRef'])
	await cloneAllReferencedTargets(tx, {
		sourceQuery,
		scopeTagName: 'Application',
		scopeRef: applicationRef,
		resolveTargetParent: createAncestryResolver({ sourceQuery, structure, cloneIndex }),
		alreadyCloned: new Set(cloneIndex.keys()),
		skip: REFS_ALREADY_HANDLED,
		omit: ALWAYS_OMIT,
	})

	// 4. Clone Application tree
	const targetParent = await resolveStructureRef(sourceQuery, applicationRef, structure)
	await cloneTree(tx, { sourceQuery, ref: applicationRef, targetParent, omit: ALWAYS_OMIT })
}
