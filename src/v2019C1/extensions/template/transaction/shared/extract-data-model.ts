import { dataModel } from '@/v2019C1/extensions/data-model'

import type { Scl } from '@/v2019C1/config'

/**
 * Extract DataTypeTemplates for all LNodes under a given scope.
 *
 * Queries sourceQuery (not tx) because resolve() needs source-side record ids
 * to look up lnType references. Target records have different ids and would not resolve.
 */
export async function extractDataModel(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		scopeRef: Scl.Ref<Scl.ElementsOf>
	},
): Promise<void> {
	const { sourceQuery, scopeRef } = params

	const { LNode: lnodes = [] } = await sourceQuery.findDescendants(scopeRef, {
		tagName: 'LNode',
	})
	if (lnodes.length > 0) {
		await dataModel.transaction.extract(tx, { sourceQuery, records: lnodes })
	}
}
