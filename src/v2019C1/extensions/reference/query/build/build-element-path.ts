import { buildPathFromAncestry } from './path-segment'

import { toRawRecord } from '@dialecte/core/helpers'

import type { ElementPath } from './path-segment.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function buildElementPath(
	query: Core.Query<Config>,
	ref: Scl.Ref<Scl.ElementsOf>,
): Promise<ElementPath | null> {
	const record = await query.getRecord(ref)
	if (!record) return null

	const ancestors = await query.findAncestors(ref, { order: 'top-down' })

	return buildPathFromAncestry({
		record: toRawRecord(record),
		ancestry: ancestors.map(toRawRecord),
	})
}
