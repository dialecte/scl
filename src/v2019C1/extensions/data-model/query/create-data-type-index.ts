import { DATA_TYPE_MODEL } from './data-types.constants'

import { invariant } from '@dialecte/core/utils'

import { readAttribute } from '@/v2019C1/helpers'

import type { DataTypeIndex, DataTypeMembersBuilder } from './data-type-index.types'
import type { DataTypeMember, DataTypeModelMember, DataTypes } from './data-types.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * An index of the data model fed record by record (`add`), a member before or after the type
 * holding it: each type of the data model by id, with its members, as the data path split reads
 * them. A member of a type that has no id is left out. The tag of a record is read first: only the
 * type and member tags cost an attribute read.
 */
export function createDataTypeIndex(): DataTypeIndex {
	const membersByType = new Map<string, Map<string, DataTypeMembersBuilder>>(
		[...DATA_TYPE_MODEL.types.keys()].map((typeTag) => [typeTag, new Map()]),
	)

	function add(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void {
		const { record, ancestry } = params
		const type = DATA_TYPE_MODEL.types.get(record.tagName)
		if (type) {
			const id = readAttribute({ record, name: type.idAttribute, defaults: 'none' })
			if (id) membersOf({ membersByType, typeTag: record.tagName, id })
			return
		}
		const parent = ancestry.at(-1)
		const parentType = parent ? DATA_TYPE_MODEL.types.get(parent.tagName) : undefined
		const modelMember = parentType?.members.get(record.tagName)
		if (!parent || !parentType || !modelMember) return
		const parentId = readAttribute({
			record: parent,
			name: parentType.idAttribute,
			defaults: 'none',
		})
		const member = memberOf({ record, modelMember })
		if (!parentId || !member) return
		const members = membersOf({ membersByType, typeTag: parent.tagName, id: parentId })
		if (modelMember.continuesObject) members.objectMembers.push(member)
		else members.attributeMembers.push(member)
	}

	function build(): DataTypes {
		return {
			lnodeTypesById: allMembersById({ membersByType, typeTag: DATA_TYPE_MODEL.rootType }),
			doTypesById: objectMembersById({ membersByType, typeTag: DATA_TYPE_MODEL.objectType }),
			daTypesById: allMembersById({ membersByType, typeTag: DATA_TYPE_MODEL.attributeType }),
		}
	}

	return { add, build }
}

/** The members of the type `typeTag` of id `id`, created empty on first sight. */
function membersOf(params: {
	membersByType: Map<string, Map<string, DataTypeMembersBuilder>>
	typeTag: string
	id: string
}): DataTypeMembersBuilder {
	const { membersByType, typeTag, id } = params
	const typesById = typesByIdOf({ membersByType, typeTag })
	const existing = typesById.get(id)
	if (existing) return existing
	const created: DataTypeMembersBuilder = { objectMembers: [], attributeMembers: [] }
	typesById.set(id, created)
	return created
}

/** The types of tag `typeTag` by id; every type of the data model is seeded when the index is created. */
function typesByIdOf(params: {
	membersByType: ReadonlyMap<string, Map<string, DataTypeMembersBuilder>>
	typeTag: string
}): Map<string, DataTypeMembersBuilder> {
	const { membersByType, typeTag } = params
	const typesById = membersByType.get(typeTag)
	invariant(typesById, {
		key: 'ASSERTION_FAILED',
		detail: 'the index holds every type of the data model',
		meta: { typeTag },
	})
	return typesById
}

/** Each type of tag `typeTag` by id, with all its members in one list. */
function allMembersById(params: {
	membersByType: ReadonlyMap<string, Map<string, DataTypeMembersBuilder>>
	typeTag: string
}): Map<string, DataTypeMember[]> {
	const { membersByType, typeTag } = params
	const typesById = typesByIdOf({ membersByType, typeTag })
	return new Map(
		[...typesById].map(([id, members]) => [
			id,
			[...members.objectMembers, ...members.attributeMembers],
		]),
	)
}

/** Each type of tag `typeTag` by id, its members continuing the data object apart from the others. */
function objectMembersById(params: {
	membersByType: ReadonlyMap<string, Map<string, DataTypeMembersBuilder>>
	typeTag: string
}): DataTypes['doTypesById'] {
	const { membersByType, typeTag } = params
	const typesById = typesByIdOf({ membersByType, typeTag })
	return new Map(
		[...typesById].map(([id, members]) => [
			id,
			{ subObjects: [...members.objectMembers], attributes: [...members.attributeMembers] },
		]),
	)
}

/** A member record as a member of its type; `undefined` when it has no name. */
function memberOf(params: {
	record: AnyRawRecord
	modelMember: DataTypeModelMember
}): DataTypeMember | undefined {
	const { record, modelMember } = params
	const name = readAttribute({ record, name: modelMember.nameAttribute, defaults: 'none' })
	if (!name) return undefined
	const type = readAttribute({ record, name: modelMember.typeAttribute, defaults: 'none' })
	const bType = modelMember.when
		? readAttribute({ record, name: modelMember.when.attribute, defaults: 'none' })
		: undefined
	return { name, ...(type ? { type } : {}), ...(bType ? { bType } : {}) }
}
