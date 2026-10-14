import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { ElementPath, PathSegmentWithRef } from '@/v2019C1/extensions/reference/query/build'
import type { AnyRawRecord, ImportWarning } from '@dialecte/core'

export type PendingResolution = {
	recordId: string
	elementTag: string
	uuidAttributeName: string
	pathValue: string
	lookupKey: string
	fallbackLookupKeys?: readonly string[]
	/**
	 * Set for a name local to a BehaviorDescription that points at a signal: once resolved, the
	 * path is written again in the standard form when the file used another one.
	 */
	normalize?: Omit<PendingPathFill, 'recordId' | 'uuidValue'>
}

/** A signal (SourceRef / ControlRef) of the file: named once all its siblings are known. */
export type CollectedSignal = {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
	uuid: string
}

/** A target element of the file, indexed by its uuid during the first pass. */
export type IndexedTarget = {
	tagName: string
	path: ElementPath
}

/**
 * A reference stored with its uuid and no path. Everything its path is composed from is kept
 * from the first pass; the path is composed once every target is indexed.
 */
export type PendingPathFill = {
	recordId: string
	pair: ReferencePair
	uuidValue: string
	referenceAttributes: readonly { name: string; value: string }[]
	/** `behavior-description` pairs only: the path segments of the BehaviorDescription's parent. */
	behaviorContext?: readonly PathSegmentWithRef[]
}

export type UnresolvedReferenceWarning = ImportWarning & {
	type: 'unresolved-reference'
	details: {
		elementTag: string
		uuidAttribute: string
		pathValue: string
		triedKeys: string[]
	}
}

export type UnsupportedXPathWarning = ImportWarning & {
	type: 'unsupported-xpath-reference'
	details: {
		elementTag: string
		pathAttribute: string
		uuidAttribute: string
		pathValue: string
	}
}

export type IncoherentReferenceWarning = ImportWarning & {
	type: 'incoherent-reference'
	details: {
		elementTag: string
		pathAttribute: string
		pathValue: string | undefined
		uuidAttribute: string
		uuidValue: string | undefined
	}
}

/**
 * An LNode bound to an IED had no `LNodeSpecNaming`: it was given one from the naming of the
 * logical node it is bound to (prefix, class, instance), the IED and LD names left out.
 */
export type DerivedSpecificationNamingWarning = ImportWarning & {
	type: 'derived-specification-naming'
	details: {
		iedName: string
		specifiedNaming: readonly { name: string; value: string }[]
	}
}

/** Every warning the import of an SCL file reports: its `type` is a key of `SCL_IMPORT_WARNINGS`. */
export type SclImportWarning =
	| UnresolvedReferenceWarning
	| UnsupportedXPathWarning
	| IncoherentReferenceWarning
	| DerivedSpecificationNamingWarning
