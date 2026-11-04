import type { PathSegmentWithRef } from './path-segment.types'

/** The segments of `segments` below `context`, or `null` when `context` is not their prefix. */
export function localSegments(params: {
	context: readonly PathSegmentWithRef[]
	segments: readonly PathSegmentWithRef[]
}): PathSegmentWithRef[] | null {
	const { context, segments } = params
	const isPrefix = context.every((part, index) => segments[index]?.ref.id === part.ref.id)
	return isPrefix ? segments.slice(context.length) : null
}
