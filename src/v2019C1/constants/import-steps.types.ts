import type { SCL_IMPORT_STEPS } from './import-steps.constants'

/** A step the SCL import session reports from `afterImport` (`SCL_IMPORT_STEPS`). */
export type SclImportStep = (typeof SCL_IMPORT_STEPS)[number]
