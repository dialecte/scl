import { ENUMERATION_TAGS, FUNCTIONAL_CONSTRAINT_ATTRIBUTE } from './read-value-types.constants'

import {
	DATA_TYPE_MODEL,
	DATA_TYPES_SELECT,
} from '@/v2019C1/extensions/data-model/query/data-types.constants'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { readAttribute } from '@/v2019C1/helpers'

import type { TypeMember, ValueDefinition, ValueTypes } from './read-value-types.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The members of every type of the template's data model, with what their values are held to, and the values of each
 * enumeration: one read of the `DataTypeTemplates`.
 */
export async function readValueTypes(query: Core.Query<Config>): Promise<ValueTypes> {
	const collected = await collectWithAncestry(query, { select: DATA_TYPES_SELECT })
	const placed = collected.records.flatMap(function withParent(record) {
		const parent = collected.ancestryOf(record.id).at(-1)
		return parent ? [{ record, parent }] : []
	})
	return {
		membersById: groupMembers(placed.flatMap((entry) => optional(typeMemberOf(entry)))),
		enumerationsById: groupEnumerations(
			placed.flatMap((entry) => optional(enumerationValueOf(entry))),
		),
	}
}

/** A value as a list of one, nothing as an empty list. */
function optional<T>(value: T | undefined): T[] {
	return value === undefined ? [] : [value]
}

/** The members, by the id of the type holding them, then by name. */
function groupMembers(
	members: readonly { typeId: string; name: string; member: TypeMember }[],
): ReadonlyMap<string, ReadonlyMap<string, TypeMember>> {
	const membersById = new Map<string, Map<string, TypeMember>>()
	for (const { typeId, name, member } of members) {
		const ofType = membersById.get(typeId) ?? new Map<string, TypeMember>()
		ofType.set(name, member)
		membersById.set(typeId, ofType)
	}
	return membersById
}

/** The values, by the id of the enumeration holding them. */
function groupEnumerations(
	values: readonly { enumerationId: string; value: string }[],
): ReadonlyMap<string, ReadonlySet<string>> {
	const enumerationsById = new Map<string, Set<string>>()
	for (const { enumerationId, value } of values) {
		const ofEnumeration = enumerationsById.get(enumerationId) ?? new Set<string>()
		ofEnumeration.add(value)
		enumerationsById.set(enumerationId, ofEnumeration)
	}
	return enumerationsById
}

/** A record as a value of the enumeration holding it, when it is one. */
function enumerationValueOf(params: {
	record: AnyRawRecord
	parent: AnyRawRecord
}): { enumerationId: string; value: string } | undefined {
	const { record, parent } = params
	if (record.tagName !== ENUMERATION_TAGS.value || parent.tagName !== ENUMERATION_TAGS.type)
		return undefined
	const enumerationId = readAttribute({ record: parent, name: 'id', defaults: 'none' })
	return enumerationId ? { enumerationId, value: record.value.trim() } : undefined
}

/** A record as a member of the type holding it, when it is one: its type's id, its name and what it is. */
function typeMemberOf(params: {
	record: AnyRawRecord
	parent: AnyRawRecord
}): { typeId: string; name: string; member: TypeMember } | undefined {
	const { record, parent } = params
	const parentType = DATA_TYPE_MODEL.types.get(parent.tagName)
	const modelMember = parentType?.members.get(record.tagName)
	if (!parentType || !modelMember) return undefined
	const typeId = readAttribute({ record: parent, name: parentType.idAttribute, defaults: 'none' })
	const name = readAttribute({ record, name: modelMember.nameAttribute, defaults: 'none' })
	if (!typeId || !name) return undefined
	const type = readAttribute({ record, name: modelMember.typeAttribute, defaults: 'none' })
	const fc = readAttribute({ record, name: FUNCTIONAL_CONSTRAINT_ATTRIBUTE, defaults: 'none' })
	return {
		typeId,
		name,
		member: {
			record,
			continuesObject: modelMember.continuesObject,
			...(type ? { type } : {}),
			...(fc ? { fc } : {}),
			definition: readDefinition({ record }),
		},
	}
}

/**
 * What a data attribute says of its values: its kind (schema default `Set` when absent), its basic type and its type.
 * Whether its value is imported is read with the `DAI` giving it (`readValueImport`).
 */
function readDefinition(params: { record: AnyRawRecord }): ValueDefinition {
	const { record } = params
	const valKind = readAttribute({ record, name: 'valKind', defaults: 'optional' })
	const bType = readAttribute({ record, name: 'bType', defaults: 'none' })
	const type = readAttribute({ record, name: 'type', defaults: 'none' })
	return {
		...(valKind ? { valKind } : {}),
		...(bType ? { bType } : {}),
		...(type ? { type } : {}),
	}
}
