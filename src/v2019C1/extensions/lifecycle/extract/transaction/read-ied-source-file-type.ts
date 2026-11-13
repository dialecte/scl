import { IED_EXPORT_SOURCE_EXTENSIONS } from './read-ied-source-file-type.constants'

import { readSourceFileType } from '@/v2019C1/extensions/lifecycle/source-file-type'

import type { Config } from '@/v2019C1/config'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/** Resolve the project source type by registered extension; XML or no extension uses the SCD convention. */
export async function readIedSourceFileType(query: Core.Query<Config>): Promise<SclFileType> {
	return readSourceFileType(query, {
		accepted: IED_EXPORT_SOURCE_EXTENSIONS,
		operation: 'extract.ied',
	})
}
