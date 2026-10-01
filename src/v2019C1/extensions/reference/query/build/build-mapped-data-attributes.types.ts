/** The data implementing a `DOS` / `SDS` / `DAS`, as the attributes need it. */
export type MappedDataImplementation = {
	lnId: string
	lnUuid: string
	dataPath: readonly string[]
}

/** What the record follows when it names nothing; the logical node may be unknown. */
export type MappedDataDefault = {
	lnId?: string
	dataPath: readonly string[]
}

export type BuildMappedDataAttributesParams = {
	tagName: 'DOS' | 'SDS' | 'DAS'
	implementation: MappedDataImplementation
	defaultData?: MappedDataDefault
}

/**
 * - `default`: the implementation is the default, the record carries neither attribute.
 * - `deviation`: the record carries the name (from its logical node) and the logical node uuid.
 * - `inexpressible`: the schema has no value for this data path; nothing can be written.
 */
export type MappedDataAttributes =
	| { kind: 'default' }
	| { kind: 'deviation'; mappedName: string; mappedLnUuid: string }
	| { kind: 'inexpressible' }
