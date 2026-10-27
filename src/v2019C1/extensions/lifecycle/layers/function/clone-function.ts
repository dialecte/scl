import { contribute } from '@/v2019C1/extensions/lifecycle/engine/contribute'
import {
	leaveOutOfScope,
	resolveContributionScope,
} from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import {
	assertMappingDecided,
	findMappingPolicy,
	resolveMapping,
} from '@/v2019C1/extensions/lifecycle/mapping'
import {
	deep as deepExtract,
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { reference } from '@/v2019C1/extensions/reference'

import type {
	CloneFunctionCategoriesParams,
	CloneFunctionCategoriesResult,
} from './clone-function.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { SourceFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMapping, MappingPolicy } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
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
 * The lineage is copied as the source holds it: the calling operation writes the identity of its direction.
 */
export async function cloneFunction(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		targetParentRef:
			| Scl.Ref<'Substation'>
			| Scl.Ref<'VoltageLevel'>
			| Scl.Ref<'Bay'>
			| Scl.Ref<'SCL'>
		omit?: OmitEntry<Config>[]
		keepNameTypesFrom?: KeepNameTypesFrom
		/** Written as a function template with no parent level (placed below the document root). */
		asTemplate?: boolean
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, functionRef, targetParentRef, omit, keepNameTypesFrom, asTemplate } = params

	// `deep` is a faithful subtree copy (no forward uuid closure); the function's own
	// satellites (FunctionCategory, ProcessResource, etc.) are placed at their source
	// hierarchy level by the recipe. The returned mappings let the recipe resolve those
	// placements against the cloned function subtree.
	const { cloneMappings } = await deepExtract(tx, {
		sourceQuery,
		ref: functionRef,
		targetParent: targetParentRef,
		omit,
		retagRoot: { from: 'SubFunction', to: 'Function' },
		withTypes: { keepNameFrom: keepNameTypesFrom },
		asTemplate,
	})

	return cloneMappings
}

/**
 * Places the FunctionCategory trees that reference the given function (or its SubFunctions).
 * Only their references to the function and what it holds are placed: one naming another function of the
 * source would name nothing in the project, or what another placement placed.
 *
 * A category is a SHARED element: where it lands is the answer of its mapping (`resolveMapping`,
 * the one the report reads too). Mapped onto a category the target already holds, it is not
 * cloned: what it contributes (its FunctionCatRef, in the SubCategory it nests them in) is poured
 * into that category (`contribute`, as the report reads it). With nothing to map onto, it is
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
	const { sourceQuery, functionRef, structure } = params
	// a category classifying several functions of one operation is placed once
	const placedCategories = params.placedCategories ?? new Map<string, Scl.Ref<'FunctionCategory'>>()

	const categoryIds = await findFunctionCategoryIds(sourceQuery, { functionRef })
	const policy = findMappingPolicy('FunctionCategory')
	const scope = await resolveContributionScope(sourceQuery, { roots: [functionRef] })

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
				matchKey: params.matchKey,
			}))
		if (existing) {
			// Do NOT skip - that would drop this function's classification.
			const contributed = await contribute(tx, {
				sourceQuery,
				source: categoryRef,
				target: existing,
				scope,
				matchKey: params.matchKey ?? 'templateUuid',
			})
			cloneMappings.push(...contributed.cloneMappings)
			redirectMappings.push(...contributed.redirectMappings)
			placedCategories.set(categoryId, existing)
			continue
		}

		const targetParent = await resolveStructureRef(sourceQuery, categoryRef, structure)

		// created here: only its references to what the placement places
		const leaveOut = await leaveOutOfScope(sourceQuery, {
			root: categoryRef,
			scope,
			leftOut: undefined,
		})
		const clone = await cloneTree(tx, { sourceQuery, ref: categoryRef, targetParent, leaveOut })
		if (!clone) continue
		cloneMappings.push(...clone.mappings)
		placedCategories.set(categoryId, { tagName: 'FunctionCategory', id: clone.record.id })
	}

	return { cloneMappings, redirectMappings }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** The categories classifying a function or one of its subfunctions (record ids). */
export async function findFunctionCategoryIds(
	sourceQuery: Core.Query<Config>,
	params: { functionRef: SourceFunctionRef },
): Promise<Set<string>> {
	const refs = await findRefsForFunctionTree(sourceQuery, params.functionRef)

	const categoryIds = new Set<string>()
	for (const { container } of refs) {
		if (container) categoryIds.add(container.id)
	}
	return categoryIds
}

async function findRefsForFunctionTree(
	sourceQuery: Core.Query<Config>,
	functionRef: SourceFunctionRef,
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
		matchKey: MatchKey | undefined
	},
): Promise<Scl.Ref<'FunctionCategory'> | undefined> {
	const { sourceQuery, categoryRef, policy, decision, matchKey } = params
	if (!policy) return undefined

	const resolved = await resolveMapping(tx, {
		sourceQuery,
		sourceRef: categoryRef,
		policy,
		decision,
		matchKey,
	})
	if (categoryRef.id) {
		assertMappingDecided({
			sourceRef: { tagName: 'FunctionCategory', id: categoryRef.id },
			resolved,
		})
	}
	const { existing } = resolved
	return existing ? { tagName: 'FunctionCategory', id: existing.id } : undefined
}
