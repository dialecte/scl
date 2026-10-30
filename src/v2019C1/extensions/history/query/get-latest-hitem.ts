import { getSortedHitems } from './get-sorted-hitem'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: returns the latest Hitem by version/revision.
 *
 * @intent latest History entry of a document, current version and revision, last Hitem
 */
export async function getLatestHitem(
	query: Core.Query<Config>,
): Promise<Scl.TrackedRecord<'Hitem'> | undefined> {
	const sorted = await getSortedHitems(query)
	return sorted.at(-1)
}
