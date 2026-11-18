import { getPathSegment } from './path-segment'
import { readSiblingsOfEach } from './read-siblings-of-each'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The name of a signal (SourceRef / ControlRef) among its siblings already read (its parent's children,
 * the signal included), `null` when it has none.
 */
export function nameAmongSiblings(params: {
	record: Core.AnyRawRecord
	siblings: Core.AnyRawRecord[]
}): string | null {
	return getPathSegment(params.record, { siblings: params.siblings })?.segment ?? null
}

/** The siblings of one signal (`readSiblingsOfEach` of the record alone): its parent's children of its tag. */
export async function readSiblings(
	query: Core.Query<Config>,
	record: Core.AnyRawRecord,
): Promise<Core.AnyRawRecord[]> {
	const [siblings] = await readSiblingsOfEach({ query, records: [record] })
	return siblings
}
