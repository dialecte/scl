export * from './constants'
export type * from './constants'
export * from './guards'
export type { MappedData, ResolvedReference, ResolveMappedDataParams } from './query'
export type { SetMappedDataParams, SetMappedDataResult } from './transaction'

// what a path can address, read from a record alone — no query
export { getPathSegment } from './query/build/path-segment'
export type { PathSegment } from './query/build/path-segment.types'
