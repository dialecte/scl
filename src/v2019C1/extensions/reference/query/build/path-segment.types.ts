import type { AnyRawRecord } from '@dialecte/core'

export type PathSegment = {
	segment: string
	separator: '/' | '.'
}

export type PathExtractor = (record: AnyRawRecord) => PathSegment | null
