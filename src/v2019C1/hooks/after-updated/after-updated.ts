import { syncMinRequestedScdFileOnUpdate } from './min-requested-scd-file'
import { updateRefPaths } from './ref-paths'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * When a target element is renamed, recalculate path attrs on all ref elements
 * pointing to it via UUID. See ref-paths.ts for details.
 */
export async function afterUpdated<GenericElement extends Scl.ElementsOf>(params: {
	oldRecord: Scl.RawRecord<GenericElement>
	newRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const refPathOps = await updateRefPaths(params)
	const minRequestedScdFileOps = await syncMinRequestedScdFileOnUpdate(params)

	return [...refPathOps, ...minRequestedScdFileOps]
}
