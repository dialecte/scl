import { createInfoContext } from './info-context'
import { describeRecord } from './of'

import { toRef } from '@dialecte/core/helpers'

import type { ElementInfo, InfoOptions } from './of.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * `of` for several elements, in the order given: each one's own title (not its path from the root,
 * which is `reference.buildElementPath`), and its state with `withState: true`. The elements are read
 * in one batch, and what they share is read once for the whole call: the siblings of each signal
 * parent and, for the states, the kinds of the IEDs and what implements each LNode. An element given
 * as a record is described as stored.
 *
 * @intent own titles or display names of many elements in one call, states of many LNodes or signals, instead of calling info.of in a loop
 */
export async function ofEach(
	query: Core.Query<Config>,
	refsOrRecords: readonly AnyRefOrRecord[],
	options: InfoOptions = {},
): Promise<ElementInfo[]> {
	const lnodes = refsOrRecords.flatMap((refOrRecord) =>
		refOrRecord.tagName === 'LNode' && refOrRecord.id !== undefined
			? [{ tagName: 'LNode' as const, id: refOrRecord.id }]
			: [],
	)
	const context = createInfoContext(query, { lnodes })
	// Read by ref: a caller's record may carry a rewritten parent or children, the stored one is described.
	const refs = refsOrRecords.map((refOrRecord) => toRef(refOrRecord) as Scl.Ref<Scl.ElementsOf>)
	const records = await query.getRecords(refs)
	const infos: ElementInfo[] = []
	for (const record of records) {
		const info = await describeRecord({ query, record, options, context })
		infos.push(info)
	}
	return infos
}
