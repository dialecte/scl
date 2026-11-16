import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { ReadLiveTargetUuidsParams } from './names-follow-targets.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The uuids the `childTag` siblings' tuple references name that name an element the document holds, one read per kind
 * of target; `undefined` when the tag names nothing by a tuple uuid or no sibling writes one.
 */
export async function readLiveTargetUuids(
	query: Core.Query<Config>,
	params: ReadLiveTargetUuidsParams,
): Promise<ReadonlySet<string> | undefined> {
	const { childTag, children } = params
	const tuplePairs = (REFERENCE_UUIDS_BY_TAG.get(childTag) ?? []).filter(
		(reference) => reference.form === 'tuple',
	)
	const named = new Set(
		tuplePairs.flatMap((pair) =>
			children.flatMap((child) => {
				const uuid = readAttribute({
					record: child,
					name: pair.uuid,
					defaults: 'none',
					fullObject: true,
				})?.value
				return uuid ? [uuid] : []
			}),
		),
	)
	if (named.size === 0) return undefined
	const targetTags = [...new Set(tuplePairs.flatMap((pair) => pair.target))]
	const live = new Set<string>()
	for (const targetTag of targetTags) {
		const targets = await query.getRecordsByTagName(targetTag as Scl.ElementsOf)
		for (const target of targets) {
			const uuid = readAttribute({
				record: target,
				name: 'uuid',
				defaults: 'none',
				fullObject: true,
			})?.value
			if (uuid && named.has(uuid)) live.add(uuid)
		}
	}
	return live
}
