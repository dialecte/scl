import { addEntry } from './add-entry'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { StartFileParams } from './start-file.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Start the file an operation writes into the document, with its first history item. A new file (`as: 'new'`) gets a
 * `Header` with a uuid of its own, version `0` and revision `1` (a `Header` the document holds is kept). A new
 * revision of an existing file (`as: 'revision'`) is not available yet: refused with `OPTION_NOT_AVAILABLE` before
 * anything is written.
 */
export async function startFile(
	tx: Core.Transaction<Config>,
	params: StartFileParams,
): Promise<void> {
	const { as, filename, header, item } = params
	switch (as) {
		case 'new':
			await addEntry(tx, { filename, header: { ...header, version: 'keep' }, item })
			return
		case 'revision':
			throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
				meta: { option: 'as', value: as },
				detail: `startFile: a new revision of an existing ${header.fileType} file is not available yet`,
			})
		default:
			throwDialecteError('ASSERTION_FAILED', {
				detail: `startFile: unhandled file start ${String(as satisfies never)}`,
			})
	}
}
