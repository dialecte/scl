import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'

/** The files an IED of the project is updated from: a template ISD (an ICD's update waits for the vendor file rules). */
export const UPDATED_IED_FILE_TYPES: ReadonlySet<SclFileType> = new Set<SclFileType>(['ISD'])
