import type { Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { AnyRawRecord } from '@dialecte/core'

export type ReadCarriedLNodesParams = {
	/** The scope an extract writes. */
	scopeRef: Scl.Ref<TopologyStructuralTag>
}

export type CarriedLNodes = {
	/** Every LNode of the substations, lines and processes, the document's own (no vendor payload), in document order. */
	lnodes: readonly Scl.TrackedRecord<'LNode'>[]
	/** The ids of those the extract of the scope writes. */
	carried: ReadonlySet<string>
}

export type WrittenByFrameParams = {
	lnode: AnyRawRecord
	/** The records above the LNode, the document root first. */
	ancestry: readonly AnyRawRecord[]
	scopeId: string
	/** The ids of the structural levels above the scope. */
	levelsAbove: ReadonlySet<string>
}
