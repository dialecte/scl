import type { Scl } from '@/v2019C1/config'

/** What `resolveMappedLNodes` is asked about: the LNodes, any number of them. */
export type ResolveMappedLNodesParams = {
	lnodes: readonly Scl.Ref<'LNode'>[]
}

/** The logical node implementing an LNode and the IED holding it. */
export type MappedLNode = {
	ln: Scl.Ref<'LN' | 'LN0'>
	ied: Scl.Ref<'IED'>
}

/** What implements each LNode, by LNode id; an LNode nothing implements is absent. */
export type MappedLNodes = ReadonlyMap<string, MappedLNode>

/** The native logical nodes of a document, each with its IED: by uuid and by name path, and their logical device. */
export type LogicalNodeIndex = {
	byUuid: ReadonlyMap<string, MappedLNode>
	byPath: ReadonlyMap<string, MappedLNode>
	/** The instance of the logical device holding each logical node, by logical node id. */
	ldInstById: ReadonlyMap<string, string>
}
