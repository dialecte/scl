import type { IED_EXPORT_FILE_TYPES } from './export-options.constants'
import type { Scl } from '@/v2019C1/config'

/** The file types `extract.ied` writes. */
export type IedExportFileType = (typeof IED_EXPORT_FILE_TYPES)[number]

/** Why `extract.ied` would refuse to write a file type for an IED: the key and data of the error it would throw. */
export type IedExportRefusal = {
	key: 'IED_NOT_SPECIFICATION' | 'IED_NOT_IMPLEMENTED' | 'IED_NOT_CONNECTED'
	meta: { ied: Scl.Ref<'IED'> }
}

/** One file type an IED can be exported as, or the refusal `extract.ied` would give for it. */
export type IedExportOption =
	| { fileType: IedExportFileType; offered: true }
	| { fileType: IedExportFileType; offered: false; refusal: IedExportRefusal }
