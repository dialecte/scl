import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'

/**
 * The type of file each extension a source document is read from names: `.xml`, or no extension, names an SCD. An
 * operation reading a source file accepts its own subset of these extensions.
 */
export const SCL_FILE_TYPE_BY_EXTENSION = {
	'.fsd': 'FSD',
	'.asd': 'ASD',
	'.ssd': 'SSD',
	'.scd': 'SCD',
	'.isd': 'ISD',
	'.icd': 'ICD',
	'.iid': 'IID',
	'.xml': 'SCD',
	'': 'SCD',
} as const satisfies Record<string, SclFileType>
