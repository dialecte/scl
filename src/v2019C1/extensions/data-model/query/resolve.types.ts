import type { Scl } from '@/v2019C1/config'

export type ResolvedDataModel = {
	lnodeTypes: Scl.TrackedRecord<'LNodeType'>[]
	doTypes: Scl.TrackedRecord<'DOType'>[]
	daTypes: Scl.TrackedRecord<'DAType'>[]
	enumTypes: Scl.TrackedRecord<'EnumType'>[]
}

export type DataModelMap = {
	lnodeTypes: Map<string, Scl.TrackedRecord<'LNodeType'>>
	doTypes: Map<string, Scl.TrackedRecord<'DOType'>>
	daTypes: Map<string, Scl.TrackedRecord<'DAType'>>
	enumTypes: Map<string, Scl.TrackedRecord<'EnumType'>>
}

/** The tags of the types `resolve` answers. */
export type DataTypeTag = 'LNodeType' | 'DOType' | 'DAType' | 'EnumType'

/** The tags of the members `resolve` walks: data objects, sub data objects, data attributes and nested ones. */
export type DataTypeMemberTag = 'DO' | 'SDO' | 'DA' | 'BDA'
