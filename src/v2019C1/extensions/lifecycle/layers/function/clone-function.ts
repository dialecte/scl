import {
	deep as deepExtract,
	cloneTree,
	mergeChildrenInto,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { reference } from '@/v2019C1/extensions/reference'

import type { Config, Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
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
		keepNameTypesFrom?: KeepNameTypesFrom
	},
): Promise<Scl.CloneMapping[]> {
	const {
		sourceQuery,
		functionRef,
		targetParentRef,
		omit,
		stripRootAttributes,
		keepNameTypesFrom,
	} = params

	const strip = stripRootAttributes?.length
		? { scope: 'root' as const, attributes: [...stripRootAttributes] }
		: (false as const)

	// `deep` is a faithful subtree copy (no forward uuid closure); the function's own
	// satellites (FunctionCategory, ProcessResource, etc.) are placed at their source
	// hierarchy level by the recipe. The returned mappings let the recipe resolve those
	// placements against the cloned function subtree.
	const { recordMappings } = await deepExtract(tx, {
		sourceQuery,
		ref: functionRef,
		targetParent: targetParentRef,
		omit,
		strip,
		retagRoot: { from: 'SubFunction', to: 'Function' },
		withTypes: { keepNameFrom: keepNameTypesFrom },
	})

	return recordMappings
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
		structure: TargetStructure
		stripCategoriesUuid?: boolean
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, functionRef, structure, stripCategoriesUuid = true } = params

	const categoryIds = await collectReferencedCategoryIds(sourceQuery, functionRef)

	const mappings: Scl.CloneMapping[] = []
	for (const categoryId of categoryIds) {
		const categoryRef: Scl.Ref<'FunctionCategory'> = { tagName: 'FunctionCategory', id: categoryId }

		// A same-name category already in the target IS the catalog entry (categories are
		// name-keyed). Do NOT skip - that would drop this function's classification. Merge the
		// category's referencing children (FunctionCatRef, SubCategory) into it, reusing same-name
		// nested containers instead of duplicating them.
		const existing = await findExistingCategoryByName(tx, sourceQuery, categoryId)
		if (existing) {
			const addedMappings = await mergeChildrenInto(tx, {
				sourceQuery,
				source: categoryRef,
				target: existing,
				strip: false,
			})
			mappings.push(...addedMappings)
			continue
		}

		const targetParent = await resolveStructureRef(sourceQuery, categoryRef, structure)

		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: categoryRef,
			targetParent,
			...(stripCategoriesUuid ? {} : { strip: false as const }),
		})
		if (clone) mappings.push(...clone.mappings)
	}

	return mappings
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

/** The existing target FunctionCategory sharing the source category's name (categories are name-keyed). */
async function findExistingCategoryByName(
	tx: Core.Transaction<Config>,
	sourceQuery: Core.Query<Config>,
	categoryId: string,
): Promise<Scl.Ref<'FunctionCategory'> | undefined> {
	const sourceCat = await sourceQuery.getRecord({
		tagName: 'FunctionCategory' as const,
		id: categoryId,
	})
	if (!sourceCat) return undefined

	const name = await sourceQuery.getAttribute(sourceCat, { name: 'name' })
	if (!name) return undefined

	const [existing] = await tx.findByAttributes({
		tagName: 'FunctionCategory',
		attributes: { name },
	})
	return existing ? { tagName: 'FunctionCategory', id: existing.id } : undefined
}
