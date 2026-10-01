import { findMappingPolicy, resolveMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import {
	deep as deepExtract,
	cloneTree,
	mergeChildrenInto,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { reference } from '@/v2019C1/extensions/reference'

import type {
	CloneFunctionCategoriesParams,
	CloneFunctionCategoriesResult,
} from './clone-function.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { DecisionMapping, MappingPolicy } from '@/v2019C1/extensions/lifecycle/mapping'
import type { ResolvedReference } from '@/v2019C1/extensions/reference'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Clones a Function/SubFunction tree into the target, promotes SubFunction to Function,
 * and extracts the data model.
 * UUID remapping is the caller's responsibility via `reference.applyUuidRemap` over the
 * returned mappings (see the recipe that orchestrates this and the category clones).
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
	const { cloneMappings } = await deepExtract(tx, {
		sourceQuery,
		ref: functionRef,
		targetParent: targetParentRef,
		omit,
		strip,
		retagRoot: { from: 'SubFunction', to: 'Function' },
		withTypes: { keepNameFrom: keepNameTypesFrom },
	})

	return cloneMappings
}

/**
 * Places the FunctionCategory trees that reference the given function (or its SubFunctions).
 *
 * A category is a SHARED element: where it lands is the answer of its mapping (`resolveMapping`,
 * the one the report reads too). Mapped onto a category the target already holds, it is not
 * cloned: its referencing children (FunctionCatRef, SubCategory) are merged into that category,
 * reusing same-name nested containers instead of duplicating them. With nothing to map onto, it is
 * cloned at its source-side structural level.
 *
 * UUID remapping (FunctionCatRef -> the cloned Function) is the caller's responsibility via
 * `reference.applyUuidRemap` over the combined function + category mappings, with the returned
 * redirect mappings: a reference to a category (or sub-category) that was not cloned is a
 * reference to the one it landed on.
 */
export async function cloneFunctionCategories(
	tx: Core.Transaction<Config>,
	params: CloneFunctionCategoriesParams,
): Promise<CloneFunctionCategoriesResult> {
	const { sourceQuery, functionRef, structure, stripCategoriesUuid = true } = params
	// a category classifying several functions of one operation is placed once
	const placedCategories = params.placedCategories ?? new Map<string, Scl.Ref<'FunctionCategory'>>()

	const categoryIds = await collectReferencedCategoryIds(sourceQuery, functionRef)
	const policy = findMappingPolicy('FunctionCategory')

	const cloneMappings: Scl.CloneMapping[] = []
	const redirectMappings: RedirectMapping[] = []
	for (const categoryId of categoryIds) {
		const categoryRef: Scl.Ref<'FunctionCategory'> = { tagName: 'FunctionCategory', id: categoryId }

		const existing =
			placedCategories.get(categoryId) ??
			(await findMappedCategory(tx, {
				sourceQuery,
				categoryRef,
				policy,
				decision: params.decisionMappings?.get(categoryId),
			}))
		if (existing) {
			// Do NOT skip - that would drop this function's classification.
			const merged = await mergeChildrenInto(tx, {
				sourceQuery,
				source: categoryRef,
				target: existing,
				strip: false,
			})
			cloneMappings.push(...merged.cloneMappings)
			redirectMappings.push(...merged.redirectMappings)
			const sourceUuid = await sourceQuery.getAttribute(categoryRef, { name: 'uuid' })
			if (sourceUuid) redirectMappings.push({ sourceUuid, target: existing })
			placedCategories.set(categoryId, existing)
			continue
		}

		const targetParent = await resolveStructureRef(sourceQuery, categoryRef, structure)

		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: categoryRef,
			targetParent,
			...(stripCategoriesUuid ? {} : { strip: false as const }),
		})
		if (!clone) continue
		cloneMappings.push(...clone.mappings)
		placedCategories.set(categoryId, { tagName: 'FunctionCategory', id: clone.record.id })
	}

	return { cloneMappings, redirectMappings }
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

/** The category of the target a source category is mapped onto — none when it is to be created. */
async function findMappedCategory(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		categoryRef: Scl.Ref<'FunctionCategory'>
		policy: MappingPolicy | undefined
		decision: DecisionMapping | undefined
	},
): Promise<Scl.Ref<'FunctionCategory'> | undefined> {
	const { sourceQuery, categoryRef, policy, decision } = params
	if (!policy) return undefined

	const { existing } = await resolveMapping(tx, {
		sourceQuery,
		sourceRef: categoryRef,
		policy,
		decision,
	})
	return existing ? { tagName: 'FunctionCategory', id: existing.id } : undefined
}
