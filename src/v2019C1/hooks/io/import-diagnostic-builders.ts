import { createDiagnostic } from '@dialecte/core'

import {
	INCOHERENT_REFERENCE_RELATED,
	SCL_IMPORT_DIAGNOSTICS,
} from '@/v2019C1/errors/import-diagnostics.constants'

import type {
	DataPathNotSplitDiagnostic,
	DerivedSpecificationNamingDiagnostic,
	IncoherentPathNamesDiagnostic,
	IncoherentReferenceDiagnostic,
	UnresolvedReferenceDiagnostic,
	UnsupportedXPathDiagnostic,
} from '@/v2019C1/errors/import-diagnostics.types'
import type { DiagnosticRef } from '@dialecte/core'

/** A reference whose path names no element of the file. */
export function unresolvedReferenceDiagnostic(params: {
	ref: DiagnosticRef
	meta: UnresolvedReferenceDiagnostic['meta']
}): UnresolvedReferenceDiagnostic {
	return createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unresolved-reference', params)
}

/** A reference written in a form that is not resolved. */
export function unsupportedXPathDiagnostic(params: {
	ref: DiagnosticRef
	meta: UnsupportedXPathDiagnostic['meta']
}): UnsupportedXPathDiagnostic {
	return createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unsupported-xpath-reference', params)
}

/** A reference whose path and uuid name two different elements, with the elements involved. */
export function incoherentReferenceDiagnostic(params: {
	ref: DiagnosticRef
	meta: IncoherentReferenceDiagnostic['meta']
	related: IncoherentReferenceDiagnostic['related']
}): IncoherentReferenceDiagnostic {
	return createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'incoherent-reference', params)
}

/**
 * The elements an incoherent reference involves: the one its uuid names, then the one its path
 * names, each when the file holds it.
 */
export function incoherentReferenceRelated(params: {
	uuidTarget: DiagnosticRef | undefined
	pathTarget: DiagnosticRef | undefined
}): IncoherentReferenceDiagnostic['related'] {
	const { uuidTarget, pathTarget } = params
	return [
		...(uuidTarget ? [{ ref: uuidTarget, message: INCOHERENT_REFERENCE_RELATED.uuidTarget }] : []),
		...(pathTarget ? [{ ref: pathTarget, message: INCOHERENT_REFERENCE_RELATED.pathTarget }] : []),
	]
}

/** A reference whose LNode path cannot be given the data-object name a data reference by uuid carries. */
export function dataPathNotSplitDiagnostic(params: {
	ref: DiagnosticRef
	meta: DataPathNotSplitDiagnostic['meta']
}): DataPathNotSplitDiagnostic {
	return createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'data-path-not-split', params)
}

/** Attributes written from a path that the file gave other values. */
export function incoherentPathNamesDiagnostic(params: {
	ref: DiagnosticRef
	meta: IncoherentPathNamesDiagnostic['meta']
}): IncoherentPathNamesDiagnostic {
	return createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'incoherent-path-names', params)
}

/** An LNode given the specified naming of the logical node it is bound to. */
export function derivedSpecificationNamingDiagnostic(params: {
	ref: DiagnosticRef
	meta: DerivedSpecificationNamingDiagnostic['meta']
}): DerivedSpecificationNamingDiagnostic {
	return createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'derived-specification-naming', params)
}
