import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { localSegments } from '@/v2019C1/extensions/reference/query/build/local-segments'

import type { UnwrittenReferencePathReason } from '@/v2019C1/errors/import-diagnostics.types'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { ElementPath, PathSegmentWithRef } from '@/v2019C1/extensions/reference/query/build'

/**
 * Why no path composes for a reference from the element its uuid names, that element being one the pair may point at:
 * for a behaviour variable, the element out of its behaviour's reach (or the variable outside any behaviour,
 * `out-of-scope`), else the behaviour's own element with no data object to name after it (`data-missing`); for any
 * other pair, an element with no path of its own the pair can name (`wrong-target`). Pure.
 */
export function unwrittenPathReason(params: {
	pair: ReferencePair
	targetPath: ElementPath
	behaviorContext: readonly PathSegmentWithRef[] | undefined
}): UnwrittenReferencePathReason {
	const { pair, targetPath, behaviorContext } = params
	if (pair.resolution !== RESOLUTION_TYPE.behaviorDescription) return 'wrong-target'
	if (!behaviorContext) return 'out-of-scope'
	return localSegments({ context: behaviorContext, segments: targetPath.segments }) === null
		? 'out-of-scope'
		: 'data-missing'
}
