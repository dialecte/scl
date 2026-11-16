import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'

export type IsIsdInstanceParams = {
	/** The type of file the IED is read from. */
	fileType: SclFileType | undefined
	/** The IED's name in that file. */
	iedName: string | undefined
}
