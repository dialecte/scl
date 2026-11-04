import { localSegments } from './local-segments'
import { joinPathParts } from './path-segment'

import { FUNCTION_SCOPE_TAGS } from '@/v2019C1/constants'

import type { ElementPath, PathSegmentWithRef } from './path-segment.types'
import type { ReferencePair } from '@/v2019C1/extensions/reference/constants/types'

/** Whether a pair's path is relative to a function (`scope: 'function'`): the one the referrer's FunctionRef names. */
export function isFunctionScoped(pair: ReferencePair): boolean {
	return 'scope' in pair && pair.scope === 'function'
}

/**
 * A target's path below `base`, the path segments of the function the referrer's FunctionRef names,
 * that function left out, the separators as they are (`SF1/XCBR1.Oper`). `null` when the target is
 * not below the base.
 */
export function pathBelowFunction(params: {
	targetPath: ElementPath
	base: readonly PathSegmentWithRef[]
}): ElementPath | null {
	const { targetPath, base } = params
	const below = localSegments({ context: base, segments: targetPath.segments })
	if (!below || below.length === 0) return null
	return { path: joinPathParts(below), segments: below }
}

/**
 * The path of the Function (or EqFunction) nearest above a path, or the element itself when it is
 * one: the base an earlier version wrote a function-scoped path from, still read. `null` when there
 * is none.
 */
export function functionBaseOf(path: ElementPath): string | null {
	const functionIndex = path.segments.findLastIndex((segment) =>
		FUNCTION_SCOPE_TAGS.has(segment.ref.tagName),
	)
	if (functionIndex === -1) return null
	return joinPathParts(path.segments.slice(0, functionIndex + 1))
}
