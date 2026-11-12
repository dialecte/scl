import { findMappingPolicy, resolveMapping } from '@/v2019C1/extensions/lifecycle/mapping'

import type { ResolveCategoryMappingsParams } from './resolve-category-mappings.types'
import type { ResolvedMapping, ResolvedMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MappingReader } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'

/**
 * Where each category of the template lands in the project (`resolveMapping`), by its record id, resolved before the
 * placement writes anything, as the report reads them: a category the placement creates for one function is never the
 * one another function's category maps onto. One read of the categories, then one resolution each.
 */
export async function resolveCategoryMappings(
	query: MappingReader,
	params: ResolveCategoryMappingsParams,
): Promise<ResolvedMappings> {
	const { sourceQuery, decisionMappings, matchKey, landings } = params
	const policy = findMappingPolicy('FunctionCategory')
	const categoryMappings = new Map<string, ResolvedMapping>()
	if (!policy) return categoryMappings

	const categories = await sourceQuery.getRecordsByTagName('FunctionCategory')
	for (const category of categories) {
		const mapping = await resolveMapping(query, {
			sourceQuery,
			sourceRef: { tagName: 'FunctionCategory', id: category.id },
			policy,
			decision: decisionMappings?.get(category.id),
			matchKey,
			landings,
		})
		categoryMappings.set(category.id, mapping)
	}
	return categoryMappings
}
