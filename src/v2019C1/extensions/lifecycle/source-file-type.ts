import { SCL_FILE_TYPE_BY_EXTENSION } from './source-file-type.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { SclFileExtension } from './source-file-type.types'
import type { Config } from '@/v2019C1/config'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/**
 * The type of file a source document is, read from its extension (any case): one the operation accepts names its
 * type, another is refused with `OPTION_NOT_AVAILABLE` (`meta: { option: 'sourceExtension', value }`).
 */
export async function readSourceFileType(
	query: Core.Query<Config>,
	params: { accepted: ReadonlySet<SclFileExtension>; operation: string },
): Promise<SclFileType> {
	const { accepted, operation } = params
	const { extension } = await query.getDocumentInfo()
	const source = { extension: extension.toLowerCase(), accepted }
	if (isAcceptedExtension(source)) return SCL_FILE_TYPE_BY_EXTENSION[source.extension]
	return throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
		meta: { option: 'sourceExtension', value: extension },
		detail: `${operation}: source extension is not supported`,
	})
}

/** Whether the document's extension is one the operation accepts. */
function isAcceptedExtension(params: {
	extension: string
	accepted: ReadonlySet<SclFileExtension>
}): params is { extension: SclFileExtension; accepted: ReadonlySet<SclFileExtension> } {
	const { extension, accepted } = params
	return (accepted as ReadonlySet<string>).has(extension)
}
