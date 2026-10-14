import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { ElementPath } from '@/v2019C1/extensions/reference/query/build'
import type { AnyRawRecord, ImportWarning } from '@dialecte/core'

/**
 * A reference written with a path: parsed and looked up once the whole file is read, when the
 * naming of every LNode is known. `ancestry` is kept for the strategies whose names are local to
 * the referrer (behaviour description, IED address, ancestor name).
 */
export type PendingResolution = {
	recordId: string
	elementTag: string
	pair: ReferencePair
	pathValue: string
	referenceAttributes: readonly { name: string; value: string }[]
	ancestry?: readonly AnyRawRecord[]
	/** Its uuid when the file gives one: only a path in a former form is then written again. */
	uuidValue?: string
	/**
	 * Written again in the standard form once resolved whatever form it had: a name local to a
	 * BehaviorDescription that names a signal, a ProcessResource named by its full path.
	 */
	alwaysStandardize: boolean
}

/** A target element of the file, indexed by its path once the whole file is read. */
export type CollectedTarget = {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
	uuid: string
}

/** A target element of the file, indexed by its uuid. */
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
	/** `behavior-description` pairs only: the referrer's ancestors, its BehaviorDescription among them. */
	ancestry?: readonly AnyRawRecord[]
}

/**
 * The path index of the file: the standard path of each target, and the paths an earlier version
 * wrote for it (`legacyKeys`), which still resolve and are written again in the standard form.
 */
export type ImportPathIndex = {
	byPath: Map<string, string>
	legacyKeys: Set<string>
	targetsByUuid: Map<string, IndexedTarget>
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
