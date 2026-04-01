import { getSortedHitems } from './get-sorted-hitem'

import type { Scl } from '@/v2019C1/config'

/**
 * Query extension: returns the latest Hitem by version/revision.
 */
export async function getLatestHitem(
	query: Scl.Query,
): Promise<Scl.TrackedRecord<'Hitem'> | undefined> {
	const sorted = await getSortedHitems(query)
	return sorted.at(-1)
}
