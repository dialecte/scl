import {
	buildUuidRemap,
	collectUuidsByRecordId,
	remapUuidAttributes,
	STRIP_ATTRS,
} from './clone-utils'
import { extractDataModel } from './extract-data-model'

import { stripAttributes } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import { reference } from '@/v2019C1/extensions/reference'

import type { Config, Scl } from '@/v2019C1/config'
import type { ResolvedReference } from '@/v2019C1/extensions/reference'
import type { CloneMapping, ExcludeFilter } from '@dialecte/core'

// ── Public API ────────────────────────────────────────────────────────────────

export async function cloneFunctionWithCategories(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		targetParentRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
		exclude?: ExcludeFilter<Config>[]
	},
): Promise<Map<string, string>> {
	const { sourceQuery, functionRef, targetParentRef } = params

	const { mappings, sourceIdToUuid } = await cloneFunction(tx, params)

	const uuidRemap = await cloneFunctionCategories(tx, {
		sourceQuery,
		functionRef,
		targetParentRef,
		mappings,
		sourceIdToUuid,
	})

	await extractDataModel(tx, { sourceQuery, scopeRef: functionRef })

	return uuidRemap
}

// ── Clone Function tree ───────────────────────────────────────────────────────

async function cloneFunction(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		targetParentRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
		exclude?: ExcludeFilter<Config>[]
	},
): Promise<{ mappings: CloneMapping<Config>[]; sourceIdToUuid: Map<string, string> }> {
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

	return { mappings, sourceIdToUuid }
}

// ── Clone FunctionCategory trees referencing the function ─────────────────────

async function cloneFunctionCategories(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		targetParentRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
		mappings: CloneMapping<Config>[]
		sourceIdToUuid: Map<string, string>
	},
): Promise<Map<string, string>> {
	const { sourceQuery, functionRef, targetParentRef, mappings, sourceIdToUuid } = params

	const categoryIds = await collectReferencedCategoryIds(sourceQuery, functionRef)
	const uuidRemap = await buildUuidRemap({ tx, mappings, sourceIdToUuid })

	for (const categoryId of categoryIds) {
		const alreadyCloned = await isCategoryAlreadyCloned(tx, sourceQuery, categoryId)
		if (alreadyCloned) continue

		const tree = await sourceQuery.getTree({ tagName: 'FunctionCategory', id: categoryId })
		if (!tree) continue

		const strippedTree = stripAttributes(tree, [...STRIP_ATTRS])
		const remappedTree = remapUuidAttributes({
			tree: strippedTree,
			attributeNames: ['functionUuid'],
			remap: uuidRemap,
		})
		await tx.deepClone(targetParentRef, remappedTree as Scl.TreeRecord<'FunctionCategory'>)
	}

	return uuidRemap
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
