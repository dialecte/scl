import {
	collectUnusedTypes,
	lostTypeNames,
} from '@/v2019C1/extensions/data-model/query/unused-types'
import { UNUSED_TYPES_PERF_SPAN } from '@/v2019C1/extensions/data-model/query/unused-types.constants'
import { buildCascadeOperations } from '@/v2019C1/hooks/before-delete'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The operations deleting every type the operations left unused (and every record of it) and updating the
 * `DataTypeTemplates` that held them; none when they name no type a referrer stopped naming.
 *
 * A type is judged only when a referrer it had before no longer names it, and on the document as the operations leave
 * it: a type unused before stays, and so does one they name again. The operations are the transaction's and what the
 * commit's earlier steps staged, so a type a cascade of the commit itself stopped naming is judged too: `gone` holds
 * what those steps delete and `query` still reads, `pending` what they wrote, and neither counts as a referrer naming
 * a type. Every record of a pruned type is deleted, as the store deletes by id only.
 */
export async function pruneUnusedTypes(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
	/** The records the commit's earlier steps wrote: a referrer is read as they left it. */
	pending?: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	/** Record ids those steps delete and `query` still reads: they name no type any more. */
	gone?: ReadonlySet<string>
}): Promise<Scl.Operation[]> {
	const { operations, query, pending } = params
	const names = lostTypeNames(operations)
	if (names.size === 0) return []
	const alreadyGone = new Set(params.gone)

	query.perf.start(UNUSED_TYPES_PERF_SPAN)
	try {
		const { trees, gone } = await collectUnusedTypes({
			query,
			names,
			gone: alreadyGone,
			pending,
		})
		if (trees.length === 0) return []
		const within = trees
			.flatMap((tree) => tree.records.slice(1))
			.filter((record) => !alreadyGone.has(record.id))
		return await buildCascadeOperations(query, {
			cascade: { gone, causeById: new Map<string, string>(), deleted: [], within, cleared: [] },
			deletedRoots: trees.map((tree) => tree.root),
			pending,
		})
	} finally {
		query.perf.stop(UNUSED_TYPES_PERF_SPAN)
	}
}
