import { readAttribute } from '@/v2019C1/helpers'

import type { CompareFileIdentityParams, FileIdentity } from './file-identity.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Whether two documents are versions or revisions of one file: the uuid the Header of each gives its file names it
 * across its versions and revisions. A Header naming no file names none of the other's. One Header read each.
 */
export async function compareFileIdentity(
	params: CompareFileIdentityParams,
): Promise<FileIdentity> {
	const [fileUuid, otherFileUuid] = await Promise.all([
		readFileUuid(params.query),
		readFileUuid(params.otherQuery),
	])
	return { fileUuid, otherFileUuid, sameFile: fileUuid !== undefined && fileUuid === otherFileUuid }
}

/** The uuid the Header of a document gives its file, if any. */
async function readFileUuid(
	query: Core.Query<Config> | Core.Transaction<Config>,
): Promise<string | undefined> {
	const [header] = await query.getRecordsByTagName('Header')
	if (!header) return undefined
	return readAttribute({ record: header, name: 'uuid' }) || undefined
}
