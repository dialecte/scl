import type { Scl } from '@/v2019C1/config'
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
