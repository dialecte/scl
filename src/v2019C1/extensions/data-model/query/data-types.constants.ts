import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference/constants/type-id-pairs'

import type { Scl, Config } from '@/v2019C1/config'
import type { TreeSelect } from '@dialecte/core'

// The attributes the data model is read by. The type references come from the registry; the names
// and ids are the one place they are written (the registry holds references, not identities).

/** The attribute naming a data object, a sub data object, a data attribute or a nested one. */
export const MEMBER_NAME_ATTRIBUTE = 'name' satisfies Scl.AttributesOf<'DO'> &
	Scl.AttributesOf<'SDO'> &
	Scl.AttributesOf<'DA'> &
	Scl.AttributesOf<'BDA'>

/** The attribute identifying a logical node type, a data object type or a data attribute type. */
export const TYPE_ID_ATTRIBUTE = 'id' satisfies Scl.AttributesOf<'LNodeType'> &
	Scl.AttributesOf<'DOType'> &
	Scl.AttributesOf<'DAType'>

/** The attribute through which an LNode, LN or LN0 names its logical node type. */
export const LNODE_TYPE_ATTRIBUTE = TYPE_ID_REFERENCE_PAIRS.LNode[0].attribute

/** The attribute through which a member names the type it points at. */
export const MEMBER_TYPE_ATTRIBUTE = TYPE_ID_REFERENCE_PAIRS.DO[0].attribute

const STRUCT_REFERENCE = TYPE_ID_REFERENCE_PAIRS.DA[1] satisfies { target: 'DAType' }

/** The attribute holding the basic type of a data attribute. */
export const BASIC_TYPE_ATTRIBUTE = STRUCT_REFERENCE.when.attribute

/** The basic type of a data attribute that points at a data attribute type. */
export const STRUCT_BASIC_TYPE = STRUCT_REFERENCE.when.equals

/** The elements the data model is read from, by their part in it. */
export const DATA_TYPE_TAGS = {
	lnodeType: 'LNodeType',
	dataObject: 'DO',
	dataObjectType: 'DOType',
	subObject: 'SDO',
	dataAttribute: 'DA',
	dataAttributeType: 'DAType',
	nestedAttribute: 'BDA',
} as const satisfies Record<string, Scl.ElementsOf>

/** What one read of the data model keeps: the data type templates and everything in them. */
export const DATA_TYPES_SELECT = { DataTypeTemplates: true } satisfies TreeSelect<Config, 'SCL'>
