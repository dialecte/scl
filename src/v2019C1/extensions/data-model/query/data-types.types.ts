import type { TypeIdReferencePair } from '@/v2019C1/extensions/reference/constants/types'

/**
 * A member of a data type: a data object of a logical node type, a sub data object or a data
 * attribute of a data object type, a nested data attribute of a data attribute type. `type` is the id
 * of the type it points at, `bType` the basic type of a data attribute.
 */
export type DataTypeMember = {
	name: string
	type?: string
	bType?: string
}

/** What a data object type holds: its sub data objects and its data attributes. */
export type DataObjectTypeMembers = {
	subObjects: readonly DataTypeMember[]
	attributes: readonly DataTypeMember[]
}

/**
 * The data model of a document, as much of it as the split of a data path needs: the data objects of
 * each logical node type, the sub data objects and data attributes of each data object type, the
 * nested data attributes of each data attribute type, each by its type id.
 */
export type DataTypes = {
	lnodeTypesById: ReadonlyMap<string, readonly DataTypeMember[]>
	doTypesById: ReadonlyMap<string, DataObjectTypeMembers>
	daTypesById: ReadonlyMap<string, readonly DataTypeMember[]>
}

/** What a data path splits into: the data object (a data object then its sub data objects, dot-joined) and the data attribute (a data attribute then its nested ones). */
export type DataPathSplit = {
	doName: string
	daName?: string
}

/** A member points at the type its reference names only when this attribute holds this value. */
export type DataTypeCondition = {
	attribute: string
	equals: string
}

/** A member of a type of the data model: how it is named and the type it points at. */
export type DataTypeModelMember = {
	/** The attribute naming the member in its type. */
	nameAttribute: string
	/** The attribute through which the member names the type it points at. */
	typeAttribute: string
	/** The type the member points at. */
	nextType: string
	/** When set, the member points at `nextType` only when it holds this condition. */
	when?: DataTypeCondition
	/** `true` when the member continues the data object, `false` when it belongs to the data attribute. */
	continuesObject: boolean
}

/** A type of the data model: the attribute identifying it and its members, by tag. */
export type DataTypeModelType = {
	idAttribute: string
	members: ReadonlyMap<string, DataTypeModelMember>
}

/**
 * The data model as the definition and the type-id references give it: the type a logical node names
 * (`rootType`), the type a data object points at (`objectType`), the type a structured data attribute
 * points at (`attributeType`) and the value its condition attribute holds then, and each type with its members.
 */
export type DataTypeModel = {
	rootType: string
	objectType: string
	attributeType: string
	attributeTypeCondition: { equals: string }
	types: ReadonlyMap<string, DataTypeModelType>
}

/** The type-id references, by referrer tag. */
export type TypeIdPairsByReferrer = ReadonlyMap<string, readonly TypeIdReferencePair[]>
