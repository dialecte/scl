import { updateRefPaths } from './ref-paths'

import type { Scl } from '@/v2019C1'

/**
 * When a target element is renamed, recalculate path attrs on all ref elements
 * pointing to it via UUID. See ref-paths.ts for details.
 */
export async function afterUpdated<GenericElement extends Scl.ElementsOf>(params: {
	oldRecord: Scl.RawRecord<GenericElement>
	newRecord: Scl.RawRecord<GenericElement>
	query: Scl.Query
}): Promise<Scl.Operation[]> {
	return updateRefPaths(params)
}
