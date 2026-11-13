import { tupleWriteOperation } from './tuple-names-operation'

import { toRawRecord } from '@dialecte/core/helpers'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { iedNameOf } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-name-of'
import { readAttribute } from '@/v2019C1/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { TupleReferenceWrite } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * When an IED is renamed, the tuple references naming it with no uuid on any of their pairs follow its
 * new name: they have no element to read the names from, so the IED's name is the one thing that ties
 * them to it. Nothing follows while another IED still holds the old name (a copy not renamed yet): the
 * references may as well name that one; nor when another IED holds the new name (a swap of two names in
 * one step): the references of both would then name one IED. The names of a logical node, device or
 * access point are not followed this way: a rename of one of those reaches a reference by its uuid only.
 *
 * A reference reading its IED from where it sits (`@`, the IED it is in, the IED of its parent) is
 * not written: it reads the new name already.
 */
export async function followNamesOnlyIedRename(
	query: Core.Query<Config>,
	params: { oldRecord: Scl.RawRecord<Scl.ElementsOf>; newRecord: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord } = params
	if (newRecord.tagName !== 'IED') return []
	const oldName = readIedName(oldRecord)
	const newName = readIedName(newRecord)
	if (!oldName || !newName || oldName === newName) return []

	const ieds = await query.getRecordsByTagName('IED')
	const nameHeld = ieds.some((ied) => {
		if (ied.id === newRecord.id) return false
		const name = readIedName(toRawRecord(ied))
		return name === oldName || name === newName
	})
	if (nameHeld) return []

	const operations: Scl.Operation[] = []
	for (const [tagName, tagPairs] of Object.entries(TUPLE_REFERENCE_PAIRS)) {
		const pairs = tagPairs as readonly TupleReferencePair[]
		const { ied } = pairs[0].tuple
		// a reference reading its IED from where it sits has no name to write
		if (!('attribute' in ied) && !('text' in ied)) continue
		const referrers = await query.getRecordsByTagName(tagName as Scl.ElementsOf)
		for (const referrer of referrers) {
			const record = toRawRecord(referrer) as AnyRawRecord
			const write = namesOnlyIedWrite({ record, pairs, oldName, newName })
			if (write) operations.push(tupleWriteOperation({ record, write }))
		}
	}
	return operations
}

/** What a reference naming `oldName` by its names only writes to name `newName`; `undefined` when it is none. */
function namesOnlyIedWrite(params: {
	record: AnyRawRecord
	pairs: readonly TupleReferencePair[]
	oldName: string
	newName: string
}): TupleReferenceWrite | undefined {
	const { record, pairs, oldName, newName } = params
	const hasUuid = pairs.some(
		(pair) =>
			readAttribute({ record, name: pair.attribute.uuid, defaults: 'none', fullObject: true }) !==
			undefined,
	)
	if (hasUuid) return undefined
	const { ied } = pairs[0].tuple
	if (iedNameOf({ role: ied, record, ancestry: [] }) !== oldName) return undefined
	return 'attribute' in ied
		? { attributes: { [ied.attribute]: newName }, value: undefined }
		: { attributes: {}, value: newName }
}

function readIedName(record: AnyRawRecord): string | undefined {
	return readAttribute({ record, name: 'name', defaults: 'none', fullObject: true })?.value
}
