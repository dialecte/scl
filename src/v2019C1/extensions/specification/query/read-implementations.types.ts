import type { Scl } from '@/v2019C1/config'
import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'

export type ReadImplementationsParams = {
	/** The LNodes asked about, as read. */
	lnodes: readonly Scl.TrackedRecord<'LNode'>[]
}

/** The IED implementing an LNode: its ref, its name and its kind. */
export type Implementation = {
	ied: Scl.Ref<'IED'>
	name: string
	kind: IedKind
}

export type Implementations = {
	/** What implements each LNode asked about, by LNode id; an LNode nothing implements is absent. */
	byLNode: ReadonlyMap<string, Implementation>
	/** Every IED of the document, in document order. */
	ieds: readonly Implementation[]
}
