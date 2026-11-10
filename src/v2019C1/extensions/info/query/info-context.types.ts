import type { Scl } from '@/v2019C1/config'
import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'
import type { MappedLNode } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes.types'

/**
 * Document-wide facts a state rule needs, read once per `of` / `ofEach` call and shared by the
 * elements of that call (an `ofEach` over a tree classifies the IEDs once, not once per LNode).
 */
export type InfoContext = {
	iedKindById: () => Promise<ReadonlyMap<string, IedKind>>
	/** What implements an LNode: the logical node and its IED. */
	mappedLNodeOf: (lnode: Scl.TrackedRecord<'LNode'>) => Promise<MappedLNode | undefined>
}

/** The LNodes a call is about, when it knows them up front: what implements them is then read once for all. */
export type InfoContextParams = { lnodes?: readonly Scl.Ref<'LNode'>[] }
