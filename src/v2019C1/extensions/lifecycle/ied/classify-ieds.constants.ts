import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'

/** The source file types that describe a real device. */
export const REAL_DEVICE_FILE_TYPES: ReadonlySet<string> = new Set<SclFileType>(['ICD', 'IID'])

/** The extension of a file describing one real device, whose IED is real by the file it is in. */
export const REAL_DEVICE_FILE_EXTENSION = '.icd'
