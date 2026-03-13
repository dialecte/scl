import type { AnyRawRecord } from '@dialecte/core'

export type PathSegment = {
	segment: string
	separator: '/' | '.'
}

export type PathExtractor = (record: AnyRawRecord) => PathSegment | null

/**
 * How a SCL reference path value should be resolved to a UUID.
 *
 * - direct:               the path value IS the exact lookup key
 * - lnode:                LNodeSpecNaming / IEC 7-2 ObjectReference — strip ".DO[.DA]" qualifier from the last segment to get the LN/LNode lookup key
 * - ied-address:          ExtRef/ExtCtrl address — indexed by full IED-internal path, exact match with IED-relative fallback
 * - behavior-description: path relative to parent BehaviorDescription scope
 * - unsupported:          path format requires context not available during streaming
 */
export type ResolutionType =
	| 'direct'
	| 'lnode'
	| 'ied-address'
	| 'behavior-description'
	| 'unsupported'

/**
 * Result of parsing a reference path value.
 */
export type ParsedReference = {
	/** Key to look up in the path → UUID index */
	lookupKey: string
	/** Fallback key when primary lookup misses (e.g., IED-relative → full path) */
	fallbackLookupKey?: string
	/** DO.SDO[.DA.BDA] chain extracted from LNodeSpecNaming paths */
	qualifier?: string
}
