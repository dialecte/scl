import { cloneTree } from './clone-utils'
import { extractDataModel } from './extract-data-model'
import { resolveStructureRef } from './resolve-structure-ref'

import { reference } from '@/v2019C1/extensions/reference'

import type { TemplateStructure } from './shared.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ResolvedReference } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Clones a Function/SubFunction tree into the target, promotes SubFunction to Function,
 * and extracts the data model.
 * UUID remapping is handled by afterDeepClone hook via cumulativeCloneMappings.
 *
 * @param stripRootAttributes - Attribute names to remove from the root element only (shallow).
 *   FSD extraction strips `templateUuid` so the clone becomes a fresh template.
 *   ASD extraction omits this param - no attributes are stripped.
 */
export async function cloneFunction(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		targetParentRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
		omit?: OmitEntry<Config>[]
		stripRootAttributes?: readonly string[]
	},
): Promise<void> {
	const { sourceQuery, functionRef, targetParentRef, omit, stripRootAttributes } = params

	const strip = stripRootAttributes?.length
		? { scope: 'root' as const, attributes: [...stripRootAttributes] }
		: (false as const)

	await cloneTree(tx, {
		sourceQuery,
		ref: functionRef,
		targetParent: targetParentRef,
		omit,
		promoteRoot: { from: 'SubFunction', to: 'Function' },
		strip,
	})

	await extractDataModel(tx, { sourceQuery, scopeRef: functionRef })
}

/**
 * Clones FunctionCategory trees that reference the given function (or its SubFunctions).
 * Each category is placed at its source-side structural level in the TEMPLATE structure.
 * UUID remapping is handled by afterDeepClone hook via cumulativeCloneMappings.
 */
export async function cloneFunctionCategories(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		structure: TemplateStructure
		stripCategoriesUuid?: boolean
	},
): Promise<void> {
	const { sourceQuery, functionRef, structure, stripCategoriesUuid = true } = params

	const categoryIds = await collectReferencedCategoryIds(sourceQuery, functionRef)

	for (const categoryId of categoryIds) {
		const alreadyCloned = await isCategoryAlreadyCloned(tx, sourceQuery, categoryId)
		if (alreadyCloned) continue

		const categoryRef: Scl.Ref<'FunctionCategory'> = { tagName: 'FunctionCategory', id: categoryId }
		const targetParent = await resolveStructureRef(sourceQuery, categoryRef, structure)

		await cloneTree(tx, {
			sourceQuery,
			ref: categoryRef,
			targetParent,
			...(stripCategoriesUuid ? {} : { strip: false as const }),
		})
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function collectReferencedCategoryIds(
	sourceQuery: Core.Query<Config>,
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
	sourceQuery: Core.Query<Config>,
	functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>,
): Promise<ResolvedReference[]> {
	const results = await reference.query.findRefsPointingTo(sourceQuery, {
		target: functionRef,
		containerTagName: 'FunctionCategory' as Scl.ElementsOf,
	})

	const { SubFunction: subFunctions = [] } = await sourceQuery.findDescendants(functionRef, {
		collect: 'SubFunction',
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
	tx: Core.Transaction<Config>,
	sourceQuery: Core.Query<Config>,
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
