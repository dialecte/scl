import type { AnyRawRecord } from '@dialecte/core'

/** A logical node an LNode names by its `lnUuid`, with the records above it down from its IED (`readAncestries`). */
export type HeldLogicalNode = {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}

/** The LNodes a commit binds (created or rebound, still held) and the logical nodes their `lnUuid` name, by uuid. */
export type BoundLNodes = {
	lnodes: readonly AnyRawRecord[]
	logicalNodesByUuid: ReadonlyMap<string, HeldLogicalNode>
}
