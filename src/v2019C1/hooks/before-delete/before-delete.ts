import { cleanOrphanedRefs } from './orphaned-refs'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Before a record (and its subtree) is deleted, clean up external refs that
 * pointed to any UUID in the deleted subtree. See orphaned-refs.ts for details.
 */
export async function beforeDelete<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	return cleanOrphanedRefs(params)
}
