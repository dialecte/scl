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

/** A reference written as a path several elements hold: `ref` is the reference and its path attribute. */
export type AmbiguousReferenceDiagnostic = Diagnostic<'ambiguous-reference'> & {
	meta: {
		uuidAttribute: string
		pathValue: string
		/** The path several elements hold. */
		sharedKey: string
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
		/** The path names data after an LNode that has no type to split it by. */
		untyped?: true
	}
}

/**
 * Why the import cannot write the path of a reference from its uuid: the uuid names no element of the file
 * (`uuid-unresolved`, an element of another file), an element of a kind the reference cannot point at, or one with no
 * path of its own, an input without an address (`wrong-target`), an element out of its behaviour's reach (`out-of-scope`), or its own behaviour's
 * element with no data object to name (`data-missing`).
 */
export type UnwrittenReferencePathReason =
	| 'uuid-unresolved'
	| 'wrong-target'
	| 'out-of-scope'
	| 'data-missing'

/**
 * A reference holding a uuid whose path the import cannot write from the element that uuid names: it is kept as read.
 * `ref` is the reference and its path attribute; `meta.pathValue` the path it holds, when it holds one.
 */
export type UnwrittenReferencePathDiagnostic = Diagnostic<'unwritten-reference-path'> & {
	meta: {
		uuidAttribute: string
		uuidValue: string
		reason: UnwrittenReferencePathReason
		pathValue?: string
	}
}

/**
 * A behaviour variable naming its input or output (`kept`, its uuid attribute) that also holds the uuid of the LNode
 * holding that input or output (`lnodeUuid`), with no data object: `ref` is the variable. Kept as read.
 */
export type RedundantLNodeUuidDiagnostic = Diagnostic<'redundant-lnode-uuid'> & {
	meta: {
		lnodeUuid: string
		kept: string
	}
}

/**
 * A behaviour variable holding attributes of both its reference groups (its data, and its input or output): `ref` is
 * the variable, `attributes` the reference attributes it holds, in the registry's order.
 */
export type ExclusiveReferenceGroupsDiagnostic = Diagnostic<'exclusive-reference-groups'> & {
	meta: {
		attributes: string[]
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
	| AmbiguousReferenceDiagnostic
	| UnsupportedXPathDiagnostic
	| IncoherentReferenceDiagnostic
	| DataPathNotSplitDiagnostic
	| ExclusiveReferenceGroupsDiagnostic
	| RedundantLNodeUuidDiagnostic
	| UnwrittenReferencePathDiagnostic
	| IncoherentPathNamesDiagnostic
	| DerivedSpecificationNamingDiagnostic
