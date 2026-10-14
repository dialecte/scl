import { getPathSegment } from './path-segment'

import { toRawRecord } from '@dialecte/core/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The name of a signal (SourceRef / ControlRef) among its siblings, `null` when it has none. */
export async function readSignalName(
	query: Core.Query<Config>,
	record: Core.AnyRawRecord,
): Promise<string | null> {
	const siblings = await readSiblings(query, record)
	return getPathSegment(record, { siblings })?.segment ?? null
}

/** The children of the record's parent, the record included. */
export async function readSiblings(
	query: Core.Query<Config>,
	record: Core.AnyRawRecord,
): Promise<Core.AnyRawRecord[]> {
	if (!record.parent) return [record]
	const parent = await query.getRecord(record.parent as Scl.Ref<Scl.ElementsOf>)
	if (!parent) return [record]
	const children = await query.getRecords(parent.children)
	return children.filter((child) => child !== undefined).map(toRawRecord)
}
