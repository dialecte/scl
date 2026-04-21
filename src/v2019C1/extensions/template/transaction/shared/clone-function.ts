import {
	buildUuidRemap,
	collectUuidsByRecordId,
	remapUuidAttributes,
	STRIP_ATTRS,
} from './clone-utils'
import { extractDataModel } from './extract-data-model'
import { resolveStructureRef } from './resolve-structure-ref'

import { stripAttributes } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import { reference } from '@/v2019C1/extensions/reference'

import type { TemplateStructure } from './template.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ResolvedReference } from '@/v2019C1/extensions/reference'
import type { ExcludeFilter } from '@dialecte/core'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Clones a Function/SubFunction tree into the target, promotes SubFunction to Function,
 * and extracts the data model. Returns sourceUuid -> targetUuid remap.
 */
export async function cloneFunction(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		targetParentRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
		exclude?: ExcludeFilter<Config>[]
	},
): Promise<Map<string, string>> {
	const { sourceQuery, functionRef, targetParentRef, exclude } = params

	const tree = await sourceQuery.getTree(functionRef, { exclude })
	invariant(tree, {
		detail: `Expected a tree for ${JSON.stringify(functionRef)}, but got ${tree}`,
		ref: functionRef,
	})

	const sourceIdToUuid = collectUuidsByRecordId({ tree: tree as Scl.TreeRecord<Scl.ElementsOf> })

	const promotedTree =
		tree.tagName === 'SubFunction' ? { ...tree, tagName: 'Function' as const } : tree

	const strippedTree = stripAttributes(promotedTree, [...STRIP_ATTRS])
	const { mappings } = await tx.deepClone(
		targetParentRef,
		strippedTree as Scl.TreeRecord<'Function'>,
	)

	const uuidRemap = await buildUuidRemap({ tx, mappings, sourceIdToUuid })
	await extractDataModel(tx, { sourceQuery, scopeRef: functionRef })

	return uuidRemap
}

/**
 * Clones FunctionCategory trees that reference the given function (or its SubFunctions).
 * Each category is placed at its source-side structural level in the TEMPLATE structure.
 * Remaps functionUuid attributes using the provided remap.
 */
export async function cloneFunctionCategories(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		structure: TemplateStructure
		uuidRemap: Map<string, string>
	},
): Promise<void> {
	const { sourceQuery, functionRef, structure, uuidRemap } = params

	const categoryIds = await collectReferencedCategoryIds(sourceQuery, functionRef)

	for (const categoryId of categoryIds) {
		const alreadyCloned = await isCategoryAlreadyCloned(tx, sourceQuery, categoryId)
		if (alreadyCloned) continue

		const categoryRef: Scl.Ref<'FunctionCategory'> = { tagName: 'FunctionCategory', id: categoryId }
		const tree = await sourceQuery.getTree(categoryRef)
		if (!tree) continue

		const targetParent = await resolveStructureRef(sourceQuery, categoryRef, structure)

		const strippedTree = stripAttributes(tree, [...STRIP_ATTRS])
		const remappedTree = remapUuidAttributes({
			tree: strippedTree,
			attributeNames: ['functionUuid'],
			remap: uuidRemap,
		})
		await tx.deepClone(targetParent, remappedTree as Scl.TreeRecord<'FunctionCategory'>)
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function collectReferencedCategoryIds(
	sourceQuery: Scl.Query,
	functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>,
): Promise<Set<string>> {
	const refs = await findRefsForFunctionTree(sourceQuery, functionRef)

	const categoryIds = new Set<string>()
	for (const { container } of refs) {
		if (container) categoryIds.add(container.id)
	}
	return categoryIds
}

async function findRefsForFunctionTree(
	sourceQuery: Scl.Query,
	functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>,
): Promise<ResolvedReference[]> {
	const results = await reference.query.findRefsPointingTo(sourceQuery, {
		target: functionRef,
		containerTagName: 'FunctionCategory' as Scl.ElementsOf,
	})

	const { SubFunction: subFunctions = [] } = await sourceQuery.findDescendants(functionRef, {
		tagName: 'SubFunction',
	})

	for (const subFunction of subFunctions) {
		const subFunctionRefs = await reference.query.findRefsPointingTo(sourceQuery, {
			target: { tagName: 'SubFunction', id: subFunction.id },
			containerTagName: 'FunctionCategory' as Scl.ElementsOf,
		})
		results.push(...subFunctionRefs)
	}

	return results
}

async function isCategoryAlreadyCloned(
	tx: Scl.Transaction,
	sourceQuery: Scl.Query,
	categoryId: string,
): Promise<boolean> {
	const sourceCat = await sourceQuery.getRecord({
		tagName: 'FunctionCategory' as const,
		id: categoryId,
	})
	if (!sourceCat) return false

	const name = await sourceQuery.getAttribute(sourceCat, { name: 'name' })
	if (!name) return false

	const [existing] = await tx.findByAttributes({
		tagName: 'FunctionCategory',
		attributes: { name },
	})
	return Boolean(existing)
}
