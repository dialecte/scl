export { SCL_ERRORS } from './errors.constants'
export {
	INCOHERENT_REFERENCE_RELATED,
	SCL_IMPORT_DIAGNOSTICS,
} from './import-diagnostics.constants'
export { isSclImportDiagnostic } from './import-diagnostics'
export type { SclErrorKey } from './errors.types'
export type {
	AmbiguousReferenceDiagnostic,
	DataPathNotSplitDiagnostic,
	DerivedSpecificationNamingDiagnostic,
	ExclusiveReferenceGroupsDiagnostic,
	IncoherentPathName,
	IncoherentPathNamesDiagnostic,
	IncoherentReferenceDiagnostic,
	IncoherentReferenceRelated,
	SclImportDiagnostic,
	SclImportDiagnosticCode,
	UnresolvedReferenceDiagnostic,
	UnsupportedXPathDiagnostic,
	UnwrittenReferencePathDiagnostic,
	UnwrittenReferencePathReason,
} from './import-diagnostics.types'
