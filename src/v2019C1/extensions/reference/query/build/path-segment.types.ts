import type { AnyRawRecord, AnyRef } from '@dialecte/core'

export type PathSegment = {
	segment: string
	separator: '/' | '.'
}

export type PathSegmentWithRef = PathSegment & {
	ref: AnyRef
}

export type ElementPath = {
	path: string
	segments: PathSegmentWithRef[]
}

/**
 * Reads the segment of an element. `siblings` (the children of its parent, itself included) is
 * read by the elements whose name depends on them (signals); without it the element is taken as
 * the only one of its name.
 */
export type PathExtractor = (
	record: AnyRawRecord,
	siblings?: readonly AnyRawRecord[],
) => PathSegment | null
