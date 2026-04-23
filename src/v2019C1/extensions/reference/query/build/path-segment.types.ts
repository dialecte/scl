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

export type PathExtractor = (record: AnyRawRecord) => PathSegment | null
