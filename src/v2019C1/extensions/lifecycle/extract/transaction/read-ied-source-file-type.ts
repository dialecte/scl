import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { Config } from '@/v2019C1/config'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/** Resolve the project source type by registered extension; XML or no extension uses the SCD convention. */
export async function readIedSourceFileType(query: Core.Query<Config>): Promise<SclFileType> {
	const { extension } = await query.getDocumentInfo()
	const sourceExtension = extension.toLowerCase()
	switch (sourceExtension) {
		case '.ssd':
			return 'SSD'
		case '.scd':
		case '.xml':
		case '':
			return 'SCD'
		default:
			throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
				meta: { option: 'sourceExtension', value: extension },
				detail: 'extract.ied: source extension is not supported',
			})
	}
}
