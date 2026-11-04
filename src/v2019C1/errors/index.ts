export { SCL_ERRORS } from './errors.constants'
export {
	INCOHERENT_REFERENCE_RELATED,
	SCL_IMPORT_DIAGNOSTICS,
} from './import-diagnostics.constants'
export { isSclImportDiagnostic } from './import-diagnostics'
export type { SclErrorKey } from './errors.types'
export type {
	DataPathNotSplitDiagnostic,
	DerivedSpecificationNamingDiagnostic,
	IncoherentPathName,
	IncoherentPathNamesDiagnostic,
	IncoherentReferenceDiagnostic,
	IncoherentReferenceRelated,
	SclImportDiagnostic,
	SclImportDiagnosticCode,
	UnresolvedReferenceDiagnostic,
	UnsupportedXPathDiagnostic,
} from './import-diagnostics.types'
