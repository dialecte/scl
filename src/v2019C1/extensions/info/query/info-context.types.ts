import type { Scl } from '@/v2019C1/config'
import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'
import type { MappedLNode } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes.types'
import type * as Core from '@dialecte/core'

/**
 * Document-wide facts a state rule needs, read once per `of` / `ofEach` call and shared by the
 * elements of that call (an `ofEach` over a tree classifies the IEDs once, not once per LNode).
 */
export type InfoContext = {
	/**
	 * The kind of an IED: a call given its LNodes classifies every IED once, a call without reads that IED alone
	 * (`undefined` when the store holds none).
	 */
	iedKindOf: (ied: Scl.Ref<'IED'>) => Promise<IedKind | undefined>
	/** What implements an LNode: the logical node and its IED. */
	mappedLNodeOf: (lnode: Scl.TrackedRecord<'LNode'>) => Promise<MappedLNode | undefined>
	/** A signal's siblings (its parent's children, the signal included), read once per parent for the call. */
	signalSiblingsOf: (signal: Core.AnyRawRecord) => Promise<Core.AnyRawRecord[]>
}

/** The LNodes a call is about, when it knows them up front: what implements them is then read once for all. */
export type InfoContextParams = { lnodes?: readonly Scl.Ref<'LNode'>[] }
