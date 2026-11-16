import type { Scl } from '@/v2019C1/config'

export type ReadHoldingLNodesParams = {
	records: readonly Scl.RawRecord<Scl.ElementsOf>[]
	/** The LNodes looked for. */
	lnodeIds: ReadonlySet<string>
	/** How many records above each record are climbed at most before giving up. */
	depth: number
}
