import { updatedOperation } from './record-ops'
import { tupleWriteOperation } from './tuple-names-operation'

import { toRawRecord } from '@dialecte/core/helpers'

import { SPECIFIED_IED_NAME_ATTRIBUTE, TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { classifyIed } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { iedNameOf } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-name-of'
import { readAttribute } from '@/v2019C1/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { IedRole } from '@/v2019C1/constants/reference-pairs.types'
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
 *
 * A specification IED is the specification of the LNodes specified on it: every `LNodeSpecNaming` naming it
 * (`sIedName`) follows its new name too, under the same conditions. The specified naming of a real IED is not
 * followed: it names what was specified, not the device.
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

	const holders = await query.findByAttributes({
		tagName: 'IED',
		attributes: { name: [oldName, newName] },
	})
	const nameHeld = holders.some((ied) => {
		if (ied.id === newRecord.id) return false
		const name = readIedName(toRawRecord(ied))
		return name === oldName || name === newName
	})
	if (nameHeld) return []

	const operations = await followSpecificationIedRename(query, {
		ied: { tagName: 'IED', id: newRecord.id },
		oldName,
		newName,
	})
	for (const [tagName, tagPairs] of Object.entries(TUPLE_REFERENCE_PAIRS)) {
		const pairs = tagPairs as readonly TupleReferencePair[]
		const { ied } = pairs[0].tuple
		// a reference reading its IED from where it sits has no name to write
		if (!('attribute' in ied) && !('text' in ied)) continue
		const referrers = await readReferrersNamingIed(query, {
			tagName: tagName as Scl.ElementsOf,
			ied,
			oldName,
		})
		for (const referrer of referrers) {
			const record = toRawRecord(referrer) as AnyRawRecord
			const write = namesOnlyIedWrite({ record, pairs, oldName, newName })
			if (write) operations.push(tupleWriteOperation({ record, write }))
		}
	}
	return operations
}

/** The `LNodeSpecNaming` naming a specification IED by `oldName` written `newName`; none for a real IED. */
async function followSpecificationIedRename(
	query: Core.Query<Config>,
	params: { ied: Scl.Ref<'IED'>; oldName: string; newName: string },
): Promise<Scl.Operation[]> {
	const { ied, oldName, newName } = params
	if ((await classifyIed(query, { ied })) !== 'specification') return []
	const namings = await query.findByAttributes({
		tagName: 'LNodeSpecNaming',
		attributes: { [SPECIFIED_IED_NAME_ATTRIBUTE]: oldName },
	})
	return namings.flatMap((naming) => {
		const record = toRawRecord(naming) as Scl.RawRecord<Scl.ElementsOf>
		const specified = readAttribute({
			record,
			name: SPECIFIED_IED_NAME_ATTRIBUTE,
			defaults: 'none',
			fullObject: true,
		})?.value
		if (specified !== oldName) return []
		const attributes = record.attributes.map((attribute) =>
			attribute.name === SPECIFIED_IED_NAME_ATTRIBUTE
				? { ...attribute, value: newName }
				: attribute,
		)
		return [updatedOperation(record, attributes)]
	})
}

/**
 * The records of `tagName` that may name the IED `oldName`: those whose IED attribute holds it, looked up; those
 * naming their IED by their text (`IEDName`), read whole (a text is not looked up).
 */
async function readReferrersNamingIed(
	query: Core.Query<Config>,
	params: { tagName: Scl.ElementsOf; ied: IedRole; oldName: string },
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { tagName, ied, oldName } = params
	if (!('attribute' in ied)) return query.getRecordsByTagName(tagName)
	return query.findByAttributes({
		tagName,
		// the attribute is named at run time: the filter type is per tag, the pair entries say it names an IED
		attributes: { [ied.attribute]: oldName } as never,
	})
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
