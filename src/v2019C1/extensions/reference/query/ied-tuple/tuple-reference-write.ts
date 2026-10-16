import { LN0_LN_CLASS, TUPLE_ROLES } from './ied-tuple.constants'
import { tuplePairApplies } from './tuple-pair-applies'
import { tupleRoleValue } from './tuple-role-value'
import { tupleTargetKind } from './tuple-target-kind'

import { RELATIVE_IED_NAME } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { TupleReferenceWrite, TupleTargetParts } from './ied-tuple.types'
import type { TupleReferencePair, TupleRole } from '@/v2019C1/constants/reference-pairs.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * What a tuple reference writes so each pair names the element its uuid names: the uuid `retarget`
 * gives (a pair whose uuid it does not map is left as it is; without `retarget` every uuid stays),
 * then the names of that element, those differing only. Each pair reads the reference as the pairs
 * before it left it (two pairs may share a name). `undefined` when nothing changes.
 *
 * A name the target leaves out (no prefix, no instance) is removed. A part the reference leaves to its schema value or to
 * another of its attributes stays left out when that already reads right. `iedName="@"` stays while
 * the target is in the IED the reference sits in (`ownIedName`). An IED named by the IED the
 * reference sits in, or by its parent, is not its to write.
 */
export function tupleReferenceWrite(params: {
	record: AnyRawRecord
	pairs: readonly TupleReferencePair[]
	partsByUuid: ReadonlyMap<string, TupleTargetParts | undefined>
	ownIedName: string | undefined
	retarget?: ReadonlyMap<string, string>
}): TupleReferenceWrite | undefined {
	const { record, pairs, partsByUuid, ownIedName, retarget } = params
	const write: TupleReferenceWrite = { attributes: {}, value: undefined }
	let current = record
	for (const pair of pairs) {
		if (!tuplePairApplies({ record: current, pair })) continue
		const uuid = readAttribute({
			record: current,
			name: pair.attribute.uuid,
			defaults: 'none',
			fullObject: true,
		})?.value
		const targetUuid = uuid && retarget ? retarget.get(uuid) : uuid
		if (!targetUuid) continue
		const parts = partsByUuid.get(targetUuid)
		const names = parts
			? pairNames({ record: current, pair, parts, ownIedName })
			: { attributes: {}, value: undefined }
		const pairWrite: TupleReferenceWrite = {
			attributes: {
				...(targetUuid === uuid ? {} : { [pair.attribute.uuid]: targetUuid }),
				...names.attributes,
			},
			value: names.value,
		}
		Object.assign(write.attributes, pairWrite.attributes)
		write.value = pairWrite.value ?? write.value
		current = applyTupleReferenceWrite({ record: current, write: pairWrite })
	}
	return Object.keys(write.attributes).length > 0 || write.value !== undefined ? write : undefined
}

/** A record as a write leaves it. */
export function applyTupleReferenceWrite(params: {
	record: AnyRawRecord
	write: TupleReferenceWrite
}): AnyRawRecord {
	const { record, write } = params
	const attributes = [
		...record.attributes.filter((attribute) => !(attribute.name in write.attributes)),
		...Object.entries(write.attributes).flatMap(([name, value]) =>
			value === undefined ? [] : [{ name, value }],
		),
	]
	return { ...record, attributes, value: write.value ?? record.value }
}

/** The names one pair of a reference writes for the target `parts` describe. */
function pairNames(params: {
	record: AnyRawRecord
	pair: TupleReferencePair
	parts: TupleTargetParts
	ownIedName: string | undefined
}): TupleReferenceWrite {
	const { record, pair, parts, ownIedName } = params
	const write: TupleReferenceWrite = { attributes: {}, value: undefined }

	const ied = pair.tuple.ied
	if ('attribute' in ied) {
		const written = readAttribute({
			record,
			name: ied.attribute,
			defaults: 'none',
			fullObject: true,
		})?.value
		const keepsRelative = written === RELATIVE_IED_NAME && ownIedName === parts.ied
		if (!keepsRelative && written !== parts.ied) write.attributes[ied.attribute] = parts.ied
	} else if ('text' in ied && record.value !== parts.ied) {
		write.value = parts.ied
	}

	for (const role of TUPLE_ROLES) {
		const name = pair.tuple[role]
		const desired = desiredValue({ parts, role })
		if (!name || desired === undefined) continue
		if (currentValue({ record, pair, role }) === desired) continue
		write.attributes[name] = desired === '' ? undefined : desired
	}
	return write
}

/** What the target says a part is: an absent prefix or instance is empty. */
function desiredValue(params: { parts: TupleTargetParts; role: TupleRole }): string | undefined {
	const { parts, role } = params
	const value = parts[role]
	if (value === undefined && (role === 'prefix' || role === 'lnInst')) return ''
	return value
}

/** What a reference says a part is, read as its address reads it (a control block's LN left out is LN0). */
function currentValue(params: {
	record: AnyRawRecord
	pair: TupleReferencePair
	role: TupleRole
}): string {
	const { record, pair, role } = params
	const value = tupleRoleValue({ record, pair, role })
	if (value !== undefined) return value
	if (role === 'lnClass' && tupleTargetKind(pair.tuple) === 'cb') return LN0_LN_CLASS
	return ''
}
