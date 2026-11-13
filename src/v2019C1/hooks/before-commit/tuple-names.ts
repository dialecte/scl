import { toRawRecord } from '@dialecte/core/helpers'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { TUPLE_TARGET_KINDS } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import {
	namesRelativeIed,
	ownIedName,
} from '@/v2019C1/extensions/reference/query/ied-tuple/own-ied-name'
import { pairsWrittenWhenSet } from '@/v2019C1/extensions/reference/query/ied-tuple/pairs-written-when-set'
import { targetTupleParts } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { readAttribute } from '@/v2019C1/helpers'
import { namedTargetUuids, partsOf, tupleNamesUpdate } from '@/v2019C1/hooks/shared'

import type {
	AncestriesById,
	Climber,
	NamingReferrer,
	ReferrerGroup,
	TargetPartsByUuid,
} from './tuple-names.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * A transaction that created tuple targets (an access point, a logical device, a logical node, a
 * control block, each with a uuid) has the references naming them by that uuid written their names
 * (see `tupleReferenceWrite`), once, over the records the transaction leaves: a target deleted since
 * is not written, a reference created or updated by the transaction is read as it stands. Each tag
 * of references that can name a created target is read once, whatever the number of targets; the
 * elements above each named target are read a level at a time, never one by one.
 */
export async function writeTupleNamesOfCreatedTargets(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { operations, query } = params
	const targetsByUuid = await readCreatedTargets({ operations, query })
	if (targetsByUuid.size === 0) return []

	const groups = await readReferrerGroups({ targetsByUuid, query })
	const naming = findNamingReferrers({ groups, targetsByUuid })
	if (naming.length === 0) return []

	const targets = namedTargets({ naming, targetsByUuid }).map(([, target]) => target)
	const held = [...targets, ...relativeReferrers({ naming })]
	const ancestriesById = await readAncestries({ records: held, query })
	return composeTupleNames({ naming, targetsByUuid, ancestriesById })
}

/** The tuple targets the transaction created and still holds, by their uuid. */
async function readCreatedTargets(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<Map<string, AnyRawRecord>> {
	const { operations, query } = params
	const refs = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const operation of operations) {
		if (operation.status !== 'created') continue
		const { tagName, id } = operation.newRecord
		if (TUPLE_TARGET_KINDS.has(tagName)) {
			refs.set(id, { tagName, id } as Scl.Ref<Scl.ElementsOf>)
		}
	}
	if (refs.size === 0) return new Map()

	const targetsByUuid = new Map<string, AnyRawRecord>()
	for (const found of await query.getRecords([...refs.values()])) {
		if (!found) continue
		const record = toRawRecord(found) as AnyRawRecord
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none', fullObject: true })?.value
		if (uuid) targetsByUuid.set(uuid, record)
	}
	return targetsByUuid
}

/** The references of each tag whose pairs name a kind of target created, one read of the tag. */
async function readReferrerGroups(params: {
	targetsByUuid: ReadonlyMap<string, AnyRawRecord>
	query: Core.Query<Config>
}): Promise<ReferrerGroup[]> {
	const { targetsByUuid, query } = params
	const createdTags = new Set([...targetsByUuid.values()].map((record) => record.tagName))
	const tagged = Object.entries(TUPLE_REFERENCE_PAIRS).flatMap(([tagName, tagPairs]) => {
		const pairs = pairsWrittenWhenSet({ pairs: tagPairs as readonly TupleReferencePair[] })
		return pairs.some((pair) => pair.target.some((target) => createdTags.has(target)))
			? [{ tagName: tagName as Scl.ElementsOf, pairs }]
			: []
	})
	return Promise.all(
		tagged.map(async ({ tagName, pairs }) => ({
			pairs,
			records: (await query.getRecordsByTagName(tagName)).map(
				(record) => toRawRecord(record) as AnyRawRecord,
			),
		})),
	)
}

/** The references naming a created target by the uuid of one of the pairs that can name its kind. */
function findNamingReferrers(params: {
	groups: readonly ReferrerGroup[]
	targetsByUuid: ReadonlyMap<string, AnyRawRecord>
}): NamingReferrer[] {
	const { groups, targetsByUuid } = params
	const targetTagByUuid = new Map(
		[...targetsByUuid].map(([uuid, target]): [string, string] => [uuid, target.tagName]),
	)
	return groups.flatMap(({ pairs, records }) =>
		records.flatMap((record) => {
			const uuids = namedTargetUuids({ record, pairs, targetTagByUuid })
			return uuids.length > 0 ? [{ record, pairs, uuids }] : []
		}),
	)
}

/** The created targets some reference names, each once, with the uuid it names them by. */
function namedTargets(params: {
	naming: readonly NamingReferrer[]
	targetsByUuid: ReadonlyMap<string, AnyRawRecord>
}): [string, AnyRawRecord][] {
	const { naming, targetsByUuid } = params
	const uuids = new Set(naming.flatMap((referrer) => referrer.uuids))
	return [...uuids].flatMap((uuid) => {
		const target = targetsByUuid.get(uuid)
		return target ? [[uuid, target] as [string, AnyRawRecord]] : []
	})
}

/** The naming references that name their IED `@`: their own IED is the one above them. */
function relativeReferrers(params: { naming: readonly NamingReferrer[] }): AnyRawRecord[] {
	return params.naming.flatMap(({ record, pairs }) =>
		namesRelativeIed({ record, pairs }) ? [record] : [],
	)
}

/**
 * The records above each record held, read a level at a time down to the IED: one read of the records
 * of that level not read yet, whatever the number of records held.
 */
async function readAncestries(params: {
	records: readonly AnyRawRecord[]
	query: Core.Query<Config>
}): Promise<Map<string, AnyRawRecord[]>> {
	const { records, query } = params
	const known = new Map<string, AnyRawRecord>()
	const ancestries = new Map<string, AnyRawRecord[]>(records.map((record) => [record.id, []]))
	let climbers: Climber[] = records.map((record) => ({ startId: record.id, record }))

	while (climbers.length > 0) {
		const missing = climbers.flatMap(({ record }) => {
			const { parent } = record
			return parent && record.tagName !== 'IED' && !known.has(parent.id) ? [parent] : []
		})
		const unique = [...new Map(missing.map((ref) => [ref.id, ref])).values()]
		if (unique.length > 0) {
			for (const found of await query.getRecords(unique as Scl.Ref<Scl.ElementsOf>[])) {
				if (found) known.set(found.id, toRawRecord(found) as AnyRawRecord)
			}
		}
		climbers = climbers.flatMap(({ startId, record }) => {
			const parent =
				record.parent && record.tagName !== 'IED' ? known.get(record.parent.id) : undefined
			if (!parent) return []
			ancestries.get(startId)?.unshift(parent)
			return [{ startId, record: parent }]
		})
	}
	return ancestries
}

/**
 * One update per naming reference, writing the names of the created targets it names by a pair that
 * can name their kind: each reference is given the parts of its own targets only, so a uuid of it
 * naming a created target of another kind (named by some other reference) is left as written.
 */
function composeTupleNames(params: {
	naming: readonly NamingReferrer[]
	targetsByUuid: ReadonlyMap<string, AnyRawRecord>
	ancestriesById: AncestriesById
}): Scl.Operation[] {
	const { naming, targetsByUuid, ancestriesById } = params
	const partsByUuid: TargetPartsByUuid = new Map(
		namedTargets({ naming, targetsByUuid }).map(([uuid, target]) => [
			uuid,
			targetTupleParts({ record: target, ancestry: ancestriesById.get(target.id) ?? [] }),
		]),
	)
	return naming.flatMap(({ record, pairs, uuids }) => {
		const above = ancestriesById.get(record.id)
		const operation = tupleNamesUpdate({
			record,
			pairs,
			partsByUuid: partsOf({ uuids, partsByUuid }),
			ownIedName: above ? ownIedName({ ancestry: above }) : undefined,
		})
		return operation ? [operation] : []
	})
}
