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

/** The native logical nodes of a document, each with its IED: by uuid and by name path. */
export type LogicalNodeIndex = {
	byUuid: ReadonlyMap<string, MappedLNode>
	byPath: ReadonlyMap<string, MappedLNode>
}
