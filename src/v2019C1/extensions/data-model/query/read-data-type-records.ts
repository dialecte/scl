import { DATA_TYPE_MODEL } from './data-types.constants'
import {
	DATA_TYPE_ID_ATTRIBUTE,
	MEMBER_TAGS_BY_TYPE,
	TYPE_REFERENCES_BY_MEMBER,
} from './read-data-type-records.constants'

import { readAttribute } from '@/v2019C1/helpers'

import type { DataTypeRecords, MembersRead } from './read-data-type-records.types'
import type { DataTypeTag } from './resolve.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRelationship, AnyTrackedRecord } from '@dialecte/core'

/**
 * Reads the data types reached from the logical node types `lnTypes` names, level by level: per level one lookup by
 * id list per type tag, then one read of the members of the types found; the members name the next level. Only what
 * the walk reaches is read, the store reads growing with the depth of the data model, not with the number of logical
 * nodes. An id several records of a tag hold, and what lies below it, is left to the walk, which looks it up alone as
 * it always did. A members read the store refuses is left unread: the walk reads those members itself and meets the
 * refusal where it always did.
 */
export async function readDataTypeRecords(params: {
	query: Core.Query<Config>
	lnTypes: readonly string[]
}): Promise<DataTypeRecords> {
	const { query, lnTypes } = params
	const typesByTag = new Map<string, Map<string, AnyTrackedRecord | undefined>>()
	const membersOf = new Set<string>()
	const membersById = new Map<string, AnyTrackedRecord | undefined>()
	/** The ids looked up so far, by tag, those held more than once included. */
	const asked = new Map<string, Set<string>>()

	let pending: ReadonlyMap<string, ReadonlySet<string>> = new Map([
		[DATA_TYPE_MODEL.rootType, new Set(lnTypes)],
	])
	while (pending.size > 0) {
		for (const [tagName, ids] of pending) {
			asked.set(tagName, new Set([...(asked.get(tagName) ?? []), ...ids]))
		}
		const level = await lookUpLevel({ query, pending })
		const found: AnyTrackedRecord[] = []
		for (const [tagName, byId] of level) {
			const known = typesByTag.get(tagName) ?? new Map<string, AnyTrackedRecord | undefined>()
			typesByTag.set(tagName, known)
			for (const [id, record] of byId) {
				known.set(id, record)
				if (record && !membersOf.has(record.id)) found.push(record)
			}
		}
		const read = await readMembers({ query, types: found })
		if (!read) break
		for (const parentId of read.parentIds) membersOf.add(parentId)
		for (const [refId, record] of read.answered) membersById.set(refId, record)
		pending = nextTypeIds({
			members: read.answered.map(([, record]) => record),
			asked,
		})
	}
	return { typesByTag, membersOf, membersById }
}

/** The records of each tag of `pending` by id, one lookup by id list per tag. */
async function lookUpLevel(params: {
	query: Core.Query<Config>
	pending: ReadonlyMap<string, ReadonlySet<string>>
}): Promise<Map<string, Map<string, AnyTrackedRecord | undefined>>> {
	const { query, pending } = params
	const tags = [...pending]
	const answers = await Promise.all(
		tags.map(([tagName, ids]) => lookUpIds({ query, tagName, ids: [...ids] })),
	)
	return new Map(tags.map(([tagName], index) => [tagName, answers[index] ?? new Map()]))
}

/**
 * Each id's record of the tag, one lookup for all: the record of that id, `undefined` when none. An id several records
 * hold is left out: the walk looks it up alone, so the record kept is the one a lookup by that id answers.
 */
async function lookUpIds(params: {
	query: Core.Query<Config>
	tagName: string
	ids: readonly string[]
}): Promise<Map<string, AnyTrackedRecord | undefined>> {
	const { query, tagName, ids } = params
	const answer = await query.findByAttributes({
		tagName: tagName as DataTypeTag,
		attributes: { id: [...ids] },
	})
	const byId = Map.groupBy(answer as readonly AnyTrackedRecord[], (record) =>
		readAttribute({ record, name: DATA_TYPE_ID_ATTRIBUTE, defaults: 'none' }),
	)
	const heldOnce = ids.filter((id) => (byId.get(id)?.length ?? 0) <= 1)
	return new Map(heldOnce.map((id) => [id, byId.get(id)?.[0]] as const))
}

/** The member records of `types` in one read, by ref id; `undefined` when the store refuses the read. */
async function readMembers(params: {
	query: Core.Query<Config>
	types: readonly AnyTrackedRecord[]
}): Promise<MembersRead | undefined> {
	const { query, types } = params
	const refs: AnyRelationship[] = types.flatMap((type) => {
		const memberTags = MEMBER_TAGS_BY_TYPE.get(type.tagName) ?? []
		return type.children.filter((child) => memberTags.includes(child.tagName))
	})
	if (refs.length === 0) return { parentIds: types.map((type) => type.id), answered: [] }
	const records = await (
		query.getRecords(refs as Parameters<typeof query.getRecords>[0]) as Promise<
			(AnyTrackedRecord | undefined)[]
		>
	).catch(() => undefined)
	if (!records) return undefined
	return {
		parentIds: types.map((type) => type.id),
		answered: refs.map((ref, index) => [ref.id, records[index]] as const),
	}
}

/** The type ids the members name that were not asked for yet, by type tag. */
function nextTypeIds(params: {
	members: readonly (AnyTrackedRecord | undefined)[]
	asked: ReadonlyMap<string, ReadonlySet<string>>
}): Map<string, Set<string>> {
	const { members, asked } = params
	const next = new Map<string, Set<string>>()
	for (const member of members) {
		if (!member) continue
		for (const pair of TYPE_REFERENCES_BY_MEMBER.get(member.tagName) ?? []) {
			if (
				pair.when &&
				readAttribute({ record: member, name: pair.when.attribute }) !== pair.when.equals
			)
				continue
			const id = readAttribute({ record: member, name: pair.attribute })
			if (!id || asked.get(pair.target)?.has(id)) continue
			const ids = next.get(pair.target) ?? new Set<string>()
			ids.add(id)
			next.set(pair.target, ids)
		}
	}
	return next
}
