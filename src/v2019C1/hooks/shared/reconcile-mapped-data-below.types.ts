import type { Scl } from '@/v2019C1/config'

export type ReconcileMappedDataOfLNodesParams = {
	/** The LNodes whose binding was rewritten, as rewritten (not staged yet). */
	lnodes: readonly Scl.RawRecord<Scl.ElementsOf>[]
}
