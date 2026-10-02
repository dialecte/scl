/** What the rules need to know about one `DOS` / `SDS` / `DAS`. */
export type MappedDataNode<GenericNode> = {
	name?: string
	ix?: string
	/** `mappedDoName` / `mappedDaName` as stored. */
	mappedName?: string
	mappedLnUuid?: string
	/** The nearest `DOS` / `SDS` above it, if any. */
	parent?: GenericNode
}

/**
 * Where the rules read the document: the query of a document, or the index an import builds
 * (which has no store access). `GenericNode` addresses a data record, `GenericLn` a logical node.
 */
export type MappedDataSource<GenericNode, GenericLn> = {
	readNode(node: GenericNode): Promise<MappedDataNode<GenericNode> | undefined>
	/** The logical node the `LNode` above the record is mapped to. */
	findLNodeLn(node: GenericNode): Promise<GenericLn | undefined>
	findLnByUuid(uuid: string): Promise<GenericLn | undefined>
	/** `path`: `IED/LD/LN`, the logical node part of an absolute reference. */
	findLnByPath(path: string): Promise<GenericLn | undefined>
}

export type MappedDataFrom<GenericLn> = {
	/** `undefined` when nothing implements the record. */
	mappedData?: { ln: GenericLn; dataPath: readonly string[]; origin: 'own' | 'default' }
	/** `undefined` when the record has no name or no `LNode` above it. */
	defaultData?: { ln?: GenericLn; dataPath: readonly string[] }
}
