import { addEntry } from './add-entry'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { StartFileParams } from './start-file.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Start the file an operation writes into the document, with its first history item. A new file (`as: 'new'`) gets a
 * `Header` with a uuid of its own, version `0` and revision `1`, replacing any previous Header. Previous history
 * inner text is carried as labelled historical context in the one new initialization item, not as file versions. A new
 * revision of an existing file (`as: 'revision'`) is not available yet: refused with `OPTION_NOT_AVAILABLE` before
 * anything is written.
 *
 * @intent start a new file in a document, give it a Header with its first history item before an operation writes it
 */
export async function startFile(
	tx: Core.Transaction<Config>,
	params: StartFileParams,
): Promise<void> {
	const { as, filename, header, item } = params
	switch (as) {
		case 'new': {
			const previousHeader = await tx.getRecord({ tagName: 'Header' })
			const previousHistory = previousHeader
				? await tx.getChild(previousHeader, 'History')
				: undefined
			const previousItems = previousHistory ? await tx.getChildren(previousHistory, 'Hitem') : []
			const historicalText = previousItems
				.map((previousItem) => previousItem.value)
				.filter((value) => value !== undefined && value !== '')
				.join('\n')
			if (previousHeader) await tx.delete(previousHeader)
			await addEntry(tx, { filename, header: { ...header, version: 'keep' }, item })
			if (historicalText) {
				const freshHeader = await tx.getRecord({ tagName: 'Header' })
				const freshHistory = await tx.getChild(freshHeader, 'History')
				const [initialItem] = await tx.getChildren(freshHistory, 'Hitem')
				await tx.update(initialItem, { value: `Historical context:\n${historicalText}` })
			}
			return
		}
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
