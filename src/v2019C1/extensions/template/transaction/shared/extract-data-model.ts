import { dataModel } from '@/v2019C1/extensions/data-model'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Extract DataTypeTemplates for all LNodes under a given scope.
 *
 * Queries sourceQuery (not tx) because resolve() needs source-side record ids
 * to look up lnType references. Target records have different ids and would not resolve.
 */
export async function extractDataModel(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
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
