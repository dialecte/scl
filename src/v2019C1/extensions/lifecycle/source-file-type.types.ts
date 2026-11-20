import type { SCL_FILE_TYPE_BY_EXTENSION } from './source-file-type.constants'

/** An extension a source document is read from, lower case with its leading dot, or none (`''`). */
export type SclFileExtension = keyof typeof SCL_FILE_TYPE_BY_EXTENSION

/** The extensions an operation reads a source from, and the operation, named in a refusal's detail. */
export type SourceFileTypeParams = {
	accepted: ReadonlySet<SclFileExtension>
	operation: string
}
