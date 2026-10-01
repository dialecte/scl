import { syncMinRequestedScdFileOnUpdate } from './min-requested-scd-file'
import { updateRefPaths } from './ref-paths'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * When a target element is renamed, recalculate path attrs on all ref elements
 * pointing to it via UUID (see ref-paths.ts), and sync the affected IEDs'
 * minimum requested SCD file (see min-requested-scd-file.ts).
 */
export async function afterUpdated<GenericElement extends Scl.ElementsOf>(params: {
	oldRecord: Scl.RawRecord<GenericElement>
	newRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, query } = params

	const refPathOps = await updateRefPaths(params)
	const minRequestedScdFileOps = await syncMinRequestedScdFileOnUpdate(query, {
		oldRecord,
		newRecord,
	})

	return [...refPathOps, ...minRequestedScdFileOps]
}
