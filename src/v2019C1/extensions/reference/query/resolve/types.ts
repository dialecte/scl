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
