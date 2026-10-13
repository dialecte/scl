import { createInfoContext } from './info-context'
import { describeElement } from './of'

import type { ElementInfo, InfoOptions } from './of.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * `of` for several elements, in the order given (a tree, a list, a breadcrumb). The document-wide
 * facts a state needs (the kinds of the IEDs, the LNs by uuid) are read once for the whole call.
 */
export async function ofEach(
	query: Core.Query<Config>,
	refsOrRecords: readonly AnyRefOrRecord[],
	options: InfoOptions = {},
): Promise<ElementInfo[]> {
	const context = createInfoContext(query)
	const infos: ElementInfo[] = []
	for (const refOrRecord of refsOrRecords) {
		infos.push(await describeElement({ query, refOrRecord, options, context }))
	}
	return infos
}
