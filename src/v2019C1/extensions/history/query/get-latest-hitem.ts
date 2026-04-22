import { getSortedHitems } from './get-sorted-hitem'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: returns the latest Hitem by version/revision.
 */
export async function getLatestHitem(
	query: Core.Query<Config>,
): Promise<Scl.TrackedRecord<'Hitem'> | undefined> {
	const sorted = await getSortedHitems(query)
	return sorted.at(-1)
}
