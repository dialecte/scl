import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Whether two queries read the same document (a copy's source and target), by the documents' own ids: never by the file
 * either was read from, which another version of the same file shares.
 */
export async function isSameDocument(params: {
	query: Core.Query<Config>
	otherQuery: Core.Query<Config>
}): Promise<boolean> {
	const [{ id: document }, { id: other }] = await Promise.all([
		params.query.getDocumentInfo(),
		params.otherQuery.getDocumentInfo(),
	])
	return document === other
}
