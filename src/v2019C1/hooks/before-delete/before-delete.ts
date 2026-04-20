import { cleanOrphanedRefs } from './orphaned-refs'

import { Scl } from '@/v2019C1'

/**
 * Before a record (and its subtree) is deleted, clean up external refs that
 * pointed to any UUID in the deleted subtree. See orphaned-refs.ts for details.
 */
export async function beforeDelete<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Scl.Query
}): Promise<Scl.Operation[]> {
	return cleanOrphanedRefs(params)
}
