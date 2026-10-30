import { SCL_IMPORT_DIAGNOSTICS } from './import-diagnostics.constants'

import { isKnownDiagnostic } from '@dialecte/core'

import type { SclImportDiagnostic } from './import-diagnostics.types'
import type { Diagnostic } from '@dialecte/core'

/**
 * Whether a diagnostic is one the import of an SCL file returns (`source: 'scl'` and a code of
 * {@link SCL_IMPORT_DIAGNOSTICS}): it is then narrowed to its typed member, so a `switch` on `code`
 * reads that code's `meta` (and `related`).
 */
export function isSclImportDiagnostic(diagnostic: Diagnostic): diagnostic is SclImportDiagnostic {
	return isKnownDiagnostic(diagnostic, { catalogues: [SCL_IMPORT_DIAGNOSTICS] })
}
