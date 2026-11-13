import type { SCL_FILE_TYPE_BY_EXTENSION } from './source-file-type.constants'

/** An extension a source document is read from, lower case with its leading dot, or none (`''`). */
export type SclFileExtension = keyof typeof SCL_FILE_TYPE_BY_EXTENSION
