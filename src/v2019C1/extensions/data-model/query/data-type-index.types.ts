import type { DataTypeMember, DataTypes } from './data-types.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Builds the data model of a document one record at a time, a member before or after the type
 * holding it (an import pass hands a record over once it is complete, its children first, a stored
 * tree is walked parents first): the same index either way.
 */
export type DataTypeIndex = {
	/** Takes one record with the records above it, outermost first; any other element is ignored. */
	add(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void
	/** The data model of the records taken so far. */
	build(): DataTypes
}

/** What a data object type holds while the index is being fed: its members are added as they come. */
export type DataObjectTypeBuilder = {
	subObjects: DataTypeMember[]
	attributes: DataTypeMember[]
}
