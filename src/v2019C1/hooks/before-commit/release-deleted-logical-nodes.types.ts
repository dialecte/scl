import type { PrunedElement } from './prune-emptied-containers.types'
import type { Scl } from '@/v2019C1/config'
import type { NamedIdentity } from '@/v2019C1/hooks/shared/element-identity.types'
import type { AnyRawRecord } from '@dialecte/core'

export type ReleaseLNodesOfDeletedLogicalNodesParams = {
	operations: ReadonlyArray<Scl.Operation>
	/** The records the commit's earlier steps wrote, by id: an LNode is released from what they leave. */
	pending: ReadonlyMap<string, AnyRawRecord>
}

/** The logical nodes a transaction deleted and did not create again: their uuids and tuple addresses. */
export type DeletedLogicalNodes = {
	uuids: ReadonlySet<string>
	addresses: ReadonlySet<string>
}

/** How an LNode names the logical node it is bound to: its uuid and the parts of its address, each where it has one. */
export type LNodeBinding = {
	iedName?: string
	ldInst?: string
	prefix?: string
	lnClass?: string
	lnInst?: string
	lnUuid?: string
}

/** An LNode the commit released from a logical node the transaction deleted: the binding it had, and the one it is left with. */
export type ReleasedLNodeBinding = {
	element: PrunedElement
	/** What names it for a person: its own uuid above all. */
	identity: NamedIdentity
	from: LNodeBinding
	to: LNodeBinding
}
