import {
	findNamedRecords,
	uuidsNamedBy,
} from '@/v2019C1/extensions/reference/query/find/named-targets'

import type { ReadLiveTargetUuidsParams } from './names-follow-targets.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The uuids the `childTag` siblings' tuple references name that name an element the document holds, one read per kind
 * of target; `undefined` when the tag names nothing by a tuple uuid or no sibling writes one.
 */
export async function readLiveTargetUuids(
	query: Core.Query<Config>,
	params: ReadLiveTargetUuidsParams,
): Promise<ReadonlySet<string> | undefined> {
	const named = params.children.flatMap((child) =>
		uuidsNamedBy({ tagName: params.childTag, attributes: child.attributes }).filter(
			(reference) => reference.form === 'tuple',
		),
	)
	if (named.length === 0) return undefined
	const live = await findNamedRecords(query, { named })
	return new Set(live.keys())
}
