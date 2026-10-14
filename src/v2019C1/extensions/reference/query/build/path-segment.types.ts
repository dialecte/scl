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
 * What an element's segment may read besides the element: `siblings` (the children of its parent,
 * itself included) for a signal, named among them; `specNaming` (its `LNodeSpecNaming`) for an
 * LNode, named by its specified naming. Without them a signal is taken as the only one of its
 * name and an LNode is named by its own attributes.
 */
export type PathSegmentContext = {
	siblings?: readonly AnyRawRecord[]
	specNaming?: AnyRawRecord
}

/** Reads the segment of an element. */
export type PathExtractor = (
	record: AnyRawRecord,
	context?: PathSegmentContext,
) => PathSegment | null
