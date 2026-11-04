import {
	collectUnusedTypes,
	lostTypeNames,
} from '@/v2019C1/extensions/data-model/query/unused-types'
import { UNUSED_TYPES_PERF_SPAN } from '@/v2019C1/extensions/data-model/query/unused-types.constants'
import { buildCascadeOperations } from '@/v2019C1/hooks/before-delete'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The operations deleting every type the transaction left unused (and every record of it) and updating the
 * `DataTypeTemplates` that held them; none when the operations name no type a referrer stopped naming.
 *
 * A type is judged only when a referrer it had before the transaction no longer names it, and on the document as the
 * transaction leaves it: a type unused before stays, and so does one the transaction names again. Every record of a
 * pruned type is deleted, as the store deletes by id only.
 */
export async function pruneUnusedTypes(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { operations, query } = params
	const names = lostTypeNames(operations)
	if (names.size === 0) return []

	query.perf.start(UNUSED_TYPES_PERF_SPAN)
	try {
		const { trees, gone } = await collectUnusedTypes({ query, names, gone: new Set() })
		if (trees.length === 0) return []
		return await buildCascadeOperations(query, {
			cascade: {
				gone,
				deleted: [],
				within: trees.flatMap((tree) => tree.records.slice(1)),
				cleared: [],
			},
			deletedRoots: trees.map((tree) => tree.root),
		})
	} finally {
		query.perf.stop(UNUSED_TYPES_PERF_SPAN)
	}
}
