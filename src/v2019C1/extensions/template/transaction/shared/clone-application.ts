import { cloneFunction, cloneFunctionCategories } from './clone-function'
import { cloneAllReferencedTargets, findMissingReferencedRecords } from './clone-referenced'
import { remapUuidAttributes, STRIP_ATTRS } from './clone-utils'
import { ALWAYS_EXCLUDE } from './exclude-filters'
import { resolveStructureRef } from './resolve-structure-ref'

import { stripAttributes } from '@dialecte/core/helpers'

import { ALL_REF_UUID_ATTRIBUTES } from '@/v2019C1/constants'

import type { TemplateStructure } from './template.types'
import type { Scl } from '@/v2019C1/config'

/**
 * ASD content brick: clones an Application and all its satellites (Functions,
 * AllocationRoles, BehaviorDescriptions) into the target template structure.
 *
 * Returns the merged sourceUuid -> targetUuid remap.
 * Reusable by ISD extraction as the inner Application clone step.
 */
export async function cloneApplicationContent(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		applicationRef: Scl.Ref<'Application'>
		structure: TemplateStructure
	},
): Promise<Map<string, string>> {
	const { sourceQuery, applicationRef, structure } = params
	const substationRef: Scl.Ref<'Substation'> = {
		tagName: 'Substation',
		id: structure.Substation.id,
	}

	const tree = await sourceQuery.getTree(applicationRef, { exclude: ALWAYS_EXCLUDE })
	if (!tree) return new Map()

	// 1. Functions: resolve structural parent per function, clone tree + data model
	const missingFunctions = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'FunctionRef',
		targetTagName: 'Function',
	})
	const functionRemap = new Map<string, string>()
	for (const ref of missingFunctions) {
		const targetParentRef = await resolveStructureRef(sourceQuery, ref, structure)
		const partial = await cloneFunction(tx, {
			sourceQuery,
			functionRef: ref,
			targetParentRef,
			exclude: ALWAYS_EXCLUDE,
		})
		for (const [key, value] of partial) functionRemap.set(key, value)
	}

	// 2. FunctionCategories: clone at source-side structural level with functionUuid remap
	for (const ref of missingFunctions) {
		await cloneFunctionCategories(tx, {
			sourceQuery,
			functionRef: ref,
			structure,
			uuidRemap: functionRemap,
		})
	}

	// 3. All other referenced targets - derived from UUID_REFERENCE_PAIRS and DESCENDANTS
	const REFS_ALREADY_HANDLED = new Set(['FunctionRef', 'FunctionCategoryRef'])
	const genericRemap = await cloneAllReferencedTargets(tx, {
		sourceQuery,
		scopeTagName: 'Application',
		scopeRef: applicationRef,
		targetParent: substationRef,
		skip: REFS_ALREADY_HANDLED,
		exclude: ALWAYS_EXCLUDE,
	})

	// 3. Remap Application tree and persist
	const remap = new Map([...functionRemap, ...genericRemap])

	const targetParent = await resolveStructureRef(sourceQuery, applicationRef, structure)

	const strippedTree = stripAttributes(tree, [...STRIP_ATTRS])
	const remappedTree = remapUuidAttributes({
		tree: strippedTree,
		attributeNames: ALL_REF_UUID_ATTRIBUTES,
		remap,
	})
	await tx.deepClone(targetParent, remappedTree as Scl.TreeRecord<'Application'>)

	return remap
}
