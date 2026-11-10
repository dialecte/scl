import { buildPathFromAncestry } from './path-segment'

import type { AnyRawRecord } from '@dialecte/core'

/** The name path of a logical node, from the records above it; `undefined` when it has no segment of its own. */
export function logicalNodePath(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): string | undefined {
	const path = buildPathFromAncestry(params)
	return path?.segments.at(-1)?.ref.id === params.record.id ? path.path : undefined
}
