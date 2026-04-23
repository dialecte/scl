import { cloneFunction, cloneFunctionCategories } from './clone-function'
import { cloneAllReferencedTargets, findMissingReferencedRecords } from './clone-referenced'
import { cloneTree } from './clone-utils'
import { ALWAYS_EXCLUDE } from './exclude-filters'
import { resolveStructureRef } from './resolve-structure-ref'

import type { TemplateStructure } from './shared.types'
import type { Scl, Config } from '@/v2019C1/config'
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
	const substationRef: Scl.Ref<'Substation'> = {
		tagName: 'Substation',
		id: structure.Substation.id,
	}

	// 1. Functions: resolve structural parent per function, clone tree + data model
	const missingFunctions = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'FunctionRef',
		targetTagName: 'Function',
	})
	for (const ref of missingFunctions) {
		const targetParentRef = await resolveStructureRef(sourceQuery, ref, structure)
		await cloneFunction(tx, {
			sourceQuery,
			functionRef: ref,
			targetParentRef,
			exclude: ALWAYS_EXCLUDE,
		})
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

	// 3. All other referenced targets - derived from UUID_REFERENCE_PAIRS and DESCENDANTS
	const REFS_ALREADY_HANDLED = new Set(['FunctionRef', 'FunctionCategoryRef'])
	await cloneAllReferencedTargets(tx, {
		sourceQuery,
		scopeTagName: 'Application',
		scopeRef: applicationRef,
		targetParent: substationRef,
		skip: REFS_ALREADY_HANDLED,
		exclude: ALWAYS_EXCLUDE,
	})

	// 4. Clone Application tree
	const targetParent = await resolveStructureRef(sourceQuery, applicationRef, structure)
	await cloneTree(tx, { sourceQuery, ref: applicationRef, targetParent, exclude: ALWAYS_EXCLUDE })
}
