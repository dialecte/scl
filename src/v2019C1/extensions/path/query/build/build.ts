import { buildPathFromAncestry } from './path-segment'

import { toRawRecord } from '@dialecte/core/helpers'

import type { Scl } from '@/v2019C1/config'

export async function build(
	query: Scl.Query,
	ref: Scl.Ref<Scl.ElementsOf>,
): Promise<string | null> {
	const record = await query.getRecord(ref)
	if (!record) return null

	const ancestors = await query.findAncestors(ref)
	const topDown = [...ancestors].reverse()

	return buildPathFromAncestry({
		record: toRawRecord(record),
		ancestry: topDown.map(toRawRecord),
	})
}
