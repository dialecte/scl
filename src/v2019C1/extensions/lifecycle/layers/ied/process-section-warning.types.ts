import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'

export type ProcessSectionWarningParams = {
	/** The type of file the IED is placed from. */
	fileType: SclFileType | undefined
}
