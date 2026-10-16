import { toRawRecord } from '@dialecte/core/helpers'

import type { AnyRawRecord, AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/** The ancestry of an element that was not read. */
export function noAncestry(): readonly AnyRawRecord[] {
	return []
}

export function toAnyRawRecord(record: AnyTrackedRecord | AnyTreeRecord): AnyRawRecord {
	return toRawRecord(record) as AnyRawRecord
}
