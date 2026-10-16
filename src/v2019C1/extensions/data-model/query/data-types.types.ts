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
