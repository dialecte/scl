import type { Scl } from '@/v2019C1/config'
import type { RefPairEntry } from '@/v2019C1/extensions/reference/constants'

/** An LNode as it was and as a hook rewrote its binding. */
export type ReboundLNode = {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
}

/** A signal of an LNode, its address references, and the LNode holding it. */
export type HeldSignal = {
	record: Scl.RawRecord<Scl.ElementsOf>
	pairs: readonly RefPairEntry[]
	lnodeId: string
}
