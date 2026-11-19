import type { Scl } from '@/v2019C1/config'

export type ReconcileMappedDataOfLNodesParams = {
	/** The LNodes whose binding was rewritten, as rewritten (not staged yet). */
	lnodes: readonly Scl.RawRecord<Scl.ElementsOf>[]
}

/** A `DOS` / `SDS` / `DAS` read below an LNode: the level it sits at below the LNode (1 for a child). */
export type DataBelow = {
	record: Scl.RawRecord<Scl.ElementsOf>
	level: number
	lnodeId: string
}
