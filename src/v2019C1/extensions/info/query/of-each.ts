import { TITLE_FIELDS_OVERRIDE } from '../constants/title'
import { describeRecords } from './describe-records'
import { createInfoContext } from './info-context'

import { isRawRecord, isTrackedRecord, isTreeRecord, toRef } from '@dialecte/core/helpers'

import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'

import type { DescribedRecord } from './describe-records.types'
import type { ElementInfo, InfoOptions } from './of.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * `of` for several elements, in the order given: each one's own title (not its path from the root,
 * which is `reference.buildElementPath`), and its state with `withState: true`. An element given as a
 * record, in the shape a query answers it (raw, tracked or a tree node, no other key), is described as
 * given, not read again (any other value is read by ref); except where its description depends on its stored
 * neighbours, where the stored record is read: a signal (named among the signals of its stored parent),
 * a tag whose title reads a child, and every element when the labels are asked. What the elements share
 * is read once for the whole call: the siblings of the signals, the children the titles and labels read
 * and, for the states, the kinds of the IEDs and what implements each LNode.
 *
 * Perf: the refs in one `getRecords`, then a fixed number of reads whatever the number of elements (at
 * most 3 for the signals); no read for records described as given without state or labels.
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
	const records = await readStoredWhereNeeded({ query, refsOrRecords, options })
	return describeRecords({ query, records, options, context })
}

/**
 * The records to describe, in the order given: a record given as itself, the stored record for a ref
 * and for a record whose description reads its stored neighbours; those read in one `getRecords`.
 */
async function readStoredWhereNeeded(params: {
	query: Core.Query<Config>
	refsOrRecords: readonly AnyRefOrRecord[]
	options: InfoOptions
}): Promise<DescribedRecord[]> {
	const { query, refsOrRecords, options } = params
	const records: DescribedRecord[] = []
	const positions: number[] = []
	const refs: Scl.Ref<Scl.ElementsOf>[] = []
	for (let index = 0; index < refsOrRecords.length; index++) {
		const refOrRecord = refsOrRecords[index]
		if (isDescribedAsGiven({ refOrRecord, options })) {
			records[index] = refOrRecord as Core.AnyRawRecord
			continue
		}
		positions.push(index)
		refs.push(toRef(refOrRecord) as Scl.Ref<Scl.ElementsOf>)
	}
	if (refs.length === 0) return records
	const read = await query.getRecords(refs)
	for (let position = 0; position < positions.length; position++) {
		records[positions[position]] = read[position]
	}
	return records
}

/**
 * Whether an element is described from what the caller gave: a record (raw, tracked or a tree node)
 * whose title, state and labels read nothing but the record itself.
 */
function isDescribedAsGiven(params: {
	refOrRecord: AnyRefOrRecord
	options: InfoOptions
}): boolean {
	const { refOrRecord, options } = params
	if (!isRecord(refOrRecord)) return false
	if (options.withLabels) return false
	if (SIGNAL_TAG_NAMES.has(refOrRecord.tagName)) return false
	return !TITLE_FIELDS_OVERRIDE[refOrRecord.tagName]?.attributesFrom
}

/** Whether an element is given as a record (raw, tracked or a tree node), not as a ref. */
function isRecord(refOrRecord: AnyRefOrRecord): refOrRecord is Core.AnyRawRecord {
	// The guards check the keys the value holds, a ref holds too few to pass any of them.
	const candidate = refOrRecord as Core.AnyRawRecord
	return isRawRecord(candidate) || isTrackedRecord(candidate) || isTreeRecord(candidate)
}
