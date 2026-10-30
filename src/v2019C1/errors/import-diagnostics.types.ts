import type {
	INCOHERENT_REFERENCE_RELATED,
	SCL_IMPORT_DIAGNOSTICS,
} from './import-diagnostics.constants'
import type { Diagnostic, DiagnosticRef } from '@dialecte/core'

/** An attribute written from a path that the file gave another value: `expected` is the path's. */
export type IncoherentPathName = {
	name: string
	value: string
	expected: string | undefined
}

/** A diagnostic's `ref` that points at one attribute of the element. */
export type DiagnosticAttributeRef = DiagnosticRef & { attribute: string }

/** A `code` of {@link SCL_IMPORT_DIAGNOSTICS}. */
export type SclImportDiagnosticCode = keyof (typeof SCL_IMPORT_DIAGNOSTICS)['codes']

/**
 * A reference written as a path names no element of the file: its uuid is left unset. `ref` is the
 * reference and its path attribute (for mapped data named by its uuid alone, its uuid attribute).
 */
export type UnresolvedReferenceDiagnostic = Diagnostic<'unresolved-reference'> & {
	meta: {
		uuidAttribute: string
		pathValue: string
		/** The paths looked up, the standard one first (empty for mapped data). */
		triedKeys: string[]
	}
}

/** A reference written in a form that is not resolved: `ref` is the reference and its path attribute. */
export type UnsupportedXPathDiagnostic = Diagnostic<'unsupported-xpath-reference'> & {
	meta: {
		uuidAttribute: string
		pathValue: string
	}
}

/**
 * An element an incoherent reference involves: `message` says which, one of
 * `INCOHERENT_REFERENCE_RELATED` (the element the uuid names, the element the path names).
 */
export type IncoherentReferenceRelated = {
	ref: DiagnosticRef
	message: (typeof INCOHERENT_REFERENCE_RELATED)[keyof typeof INCOHERENT_REFERENCE_RELATED]
}

/**
 * A reference whose path and whose uuid name two different elements: the uuid wins, the path is
 * written from the element it names. `ref` is the reference and its path attribute; `related`
 * names the element the uuid names, then the element the path names, each when the file holds it.
 */
export type IncoherentReferenceDiagnostic = Diagnostic<'incoherent-reference'> & {
	meta: {
		uuidAttribute: string
		pathValue: string
		uuidValue: string
	}
	related: IncoherentReferenceRelated[]
}

/**
 * A reference written with the path of an LNode could not be given the data-object name a data
 * reference by uuid carries: it is left as read, without the uuid. `ref` is the reference and its
 * path attribute.
 */
export type DataPathNotSplitDiagnostic = Diagnostic<'data-path-not-split'> & {
	meta: {
		pathValue: string
	}
}

/**
 * Attributes written from a path (a terminal's level names, a connectivity node's `pathName`) that
 * disagree with that path: they were written again from it. `ref` is the element holding them.
 */
export type IncoherentPathNamesDiagnostic = Diagnostic<'incoherent-path-names'> & {
	meta: {
		attributes: IncoherentPathName[]
	}
}

/**
 * An LNode bound to an IED had no `LNodeSpecNaming`: it was given one from the naming of the
 * logical node it is bound to (prefix, class, instance), the IED and LD names left out. `ref` is the
 * LNode.
 */
export type DerivedSpecificationNamingDiagnostic = Diagnostic<'derived-specification-naming'> & {
	meta: {
		iedName: string
		specifiedNaming: readonly { name: string; value: string }[]
	}
}

/** Every diagnostic the import of an SCL file returns: its `code` is a key of `SCL_IMPORT_DIAGNOSTICS`. */
export type SclImportDiagnostic =
	| UnresolvedReferenceDiagnostic
	| UnsupportedXPathDiagnostic
	| IncoherentReferenceDiagnostic
	| DataPathNotSplitDiagnostic
	| IncoherentPathNamesDiagnostic
	| DerivedSpecificationNamingDiagnostic
