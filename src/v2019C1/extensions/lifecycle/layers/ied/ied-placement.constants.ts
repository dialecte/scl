import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'

/** The name the IED of a template ISD carries: an ISD whose IED has another name is an instance file. */
export const TEMPLATE_ISD_IED_NAME = 'SPECIFICATION'

/** The files an IED is read from with the identity it has in a project (an IID, an SCD): not placed as a new IED. */
export const IDENTITY_KEEPING_FILE_TYPES: ReadonlySet<SclFileType> = new Set<SclFileType>([
	'IID',
	'SCD',
])
