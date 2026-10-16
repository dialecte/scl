import {
	BASIC_TYPE_ATTRIBUTE,
	DATA_TYPE_TAGS,
	MEMBER_NAME_ATTRIBUTE,
	MEMBER_TYPE_ATTRIBUTE,
	TYPE_ID_ATTRIBUTE,
} from './data-types.constants'

import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { DataObjectTypeBuilder, DataTypeIndex } from './data-type-index.types'
import type { DataTypeMember, DataTypes } from './data-types.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * An index of the data model fed record by record (`add`), a member before or after the type
 * holding it: the logical node types, data object types and data attribute types by id, each with
 * its members, as the data path split reads them. A member of a type that has no id is left out.
 * The tag of a record is read first: only the type and member tags cost an attribute read.
 */
export function createDataTypeIndex(): DataTypeIndex {
	const lnodeTypesById = new Map<string, DataTypeMember[]>()
	const doTypesById = new Map<string, DataObjectTypeBuilder>()
	const daTypesById = new Map<string, DataTypeMember[]>()

	function add(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void {
		const { record, ancestry } = params
		switch (record.tagName) {
			case DATA_TYPE_TAGS.lnodeType: {
				const id = readRawAttribute({ record, name: TYPE_ID_ATTRIBUTE })
				if (id) getOrCreate({ map: lnodeTypesById, key: id, create: createMembers })
				return
			}
			case DATA_TYPE_TAGS.dataObjectType: {
				const id = readRawAttribute({ record, name: TYPE_ID_ATTRIBUTE })
				if (id) getOrCreate({ map: doTypesById, key: id, create: createObjectMembers })
				return
			}
			case DATA_TYPE_TAGS.dataAttributeType: {
				const id = readRawAttribute({ record, name: TYPE_ID_ATTRIBUTE })
				if (id) getOrCreate({ map: daTypesById, key: id, create: createMembers })
				return
			}
			case DATA_TYPE_TAGS.dataObject:
				addMember({ record, ancestry, parentTag: DATA_TYPE_TAGS.lnodeType, add: addToLnodeType })
				return
			case DATA_TYPE_TAGS.subObject:
				addMember({ record, ancestry, parentTag: DATA_TYPE_TAGS.dataObjectType, add: addSubObject })
				return
			case DATA_TYPE_TAGS.dataAttribute:
				addMember({ record, ancestry, parentTag: DATA_TYPE_TAGS.dataObjectType, add: addAttribute })
				return
			case DATA_TYPE_TAGS.nestedAttribute:
				addMember({
					record,
					ancestry,
					parentTag: DATA_TYPE_TAGS.dataAttributeType,
					add: addToAttributeType,
				})
				return
		}
	}

	function addToLnodeType(parentId: string, member: DataTypeMember): void {
		getOrCreate({ map: lnodeTypesById, key: parentId, create: createMembers }).push(member)
	}

	function addSubObject(parentId: string, member: DataTypeMember): void {
		getOrCreate({ map: doTypesById, key: parentId, create: createObjectMembers }).subObjects.push(
			member,
		)
	}

	function addAttribute(parentId: string, member: DataTypeMember): void {
		getOrCreate({ map: doTypesById, key: parentId, create: createObjectMembers }).attributes.push(
			member,
		)
	}

	function addToAttributeType(parentId: string, member: DataTypeMember): void {
		getOrCreate({ map: daTypesById, key: parentId, create: createMembers }).push(member)
	}

	function build(): DataTypes {
		return {
			lnodeTypesById: new Map(lnodeTypesById),
			doTypesById: new Map(doTypesById),
			daTypesById: new Map(daTypesById),
		}
	}

	return { add, build }
}

/** A member of a type of tag `parentTag` that has an id: handed to `add` with that id. */
function addMember(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
	parentTag: string
	add: (parentId: string, member: DataTypeMember) => void
}): void {
	const { record, ancestry, parentTag, add } = params
	const parent = ancestry.at(-1)
	if (parent?.tagName !== parentTag) return
	const parentId = readRawAttribute({ record: parent, name: TYPE_ID_ATTRIBUTE })
	const member = memberOf(record)
	if (parentId && member) add(parentId, member)
}

function createMembers(): DataTypeMember[] {
	return []
}

function createObjectMembers(): DataObjectTypeBuilder {
	return { subObjects: [], attributes: [] }
}

function getOrCreate<GenericValue>(params: {
	map: Map<string, GenericValue>
	key: string
	create: () => GenericValue
}): GenericValue {
	const { map, key, create } = params
	const existing = map.get(key)
	if (existing) return existing
	const created = create()
	map.set(key, created)
	return created
}

/** A data object, sub data object, data attribute or nested one as a member of its type; `undefined` when it has no name. */
function memberOf(record: AnyRawRecord): DataTypeMember | undefined {
	const name = readRawAttribute({ record, name: MEMBER_NAME_ATTRIBUTE })
	if (!name) return undefined
	const type = readRawAttribute({ record, name: MEMBER_TYPE_ATTRIBUTE })
	const bType = readRawAttribute({ record, name: BASIC_TYPE_ATTRIBUTE })
	return { name, ...(type ? { type } : {}), ...(bType ? { bType } : {}) }
}
