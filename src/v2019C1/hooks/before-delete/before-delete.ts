import { syncMinRequestedScdFileOnDelete } from './min-requested-scd-file'
import { cleanOrphanedRefs } from './orphaned-refs'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Before a record (and its subtree) is deleted, clean up external refs that
 * pointed to any UUID in the deleted subtree (see orphaned-refs.ts), and sync the
 * affected IEDs' minimum requested SCD file (see min-requested-scd-file.ts).
 */
export async function beforeDelete<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { record, query } = params

	const orphanedRefOps = await cleanOrphanedRefs(params)
	const minRequestedScdFileOps = await syncMinRequestedScdFileOnDelete(query, { record })

	return [...orphanedRefOps, ...minRequestedScdFileOps]
}
