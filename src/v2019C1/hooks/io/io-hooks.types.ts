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

/** An element of the file with the ancestors it was read below. */
export type CollectedElement = {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}

/** A target element of the file, indexed by its path once the whole file is read. */
export type CollectedTarget = CollectedElement & {
	uuid: string
}

/** The attributes a patch sets, those it removes, and those the file gave another value. */
export type AttributeChanges = {
	attributes: { name: string; value: string }[]
	removeAttributes: string[]
	incoherent: IncoherentPathName[]
}

/** An attribute written from a path that the file gave another value: `expected` is the path's. */
export type IncoherentPathName = {
	name: string
	value: string
	expected: string | undefined
}

/** A target element of the file, indexed by its uuid. */
export type IndexedTarget = {
	tagName: string
	path: ElementPath
	/** The logical node type a logical node (an LNode, an LN) names: what its data paths are read against. */
	lnType?: string
}

/**
 * A reference stored with its uuid and no path. Everything its path is composed from is kept
 * from the first pass; the path is composed once every target is indexed.
 */
export type PendingPathFill = {
	recordId: string
	elementTag: string
	pair: ReferencePair
	uuidValue: string
	referenceAttributes: readonly { name: string; value: string }[]
	/**
	 * `behavior-description` and `ied-address` pairs only: the referrer's ancestors, its
	 * BehaviorDescription or its LNode among them.
	 */
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
 * Attributes written from a path (a terminal's level names, a connectivity node's `pathName`) that
 * disagree with that path: they were written again from it.
 */
export type IncoherentPathNamesWarning = ImportWarning & {
	type: 'incoherent-path-names'
	details: {
		elementTag: string
		attributes: IncoherentPathName[]
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

/**
 * A reference written with the path of an LNode could not be given the data-object name that a data
 * reference by uuid carries: the data path is not split by the data model of the file (no
 * type, a name the data model lacks, a path reaching a data attribute where only a data object is
 * held). The reference is left as read, without the uuid.
 */
export type DataPathNotSplitWarning = ImportWarning & {
	type: 'data-path-not-split'
	details: {
		elementTag: string
		pathAttribute: string
		pathValue: string
	}
}

/** Every warning the import of an SCL file reports: its `type` is a key of `SCL_IMPORT_WARNINGS`. */
export type SclImportWarning =
	| UnresolvedReferenceWarning
	| UnsupportedXPathWarning
	| IncoherentReferenceWarning
	| IncoherentPathNamesWarning
	| DataPathNotSplitWarning
	| DerivedSpecificationNamingWarning
