import { readAttribute } from '@/v2019C1/helpers'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The uuid the Header of a document gives its file, if any: it names the file across its versions and revisions. */
export async function readFileUuid(query: Core.Query<Config>): Promise<string | undefined> {
	const [header] = await query.getRecordsByTagName('Header')
	if (!header) return undefined
	return readAttribute({ record: header, name: 'uuid' }) || undefined
}
