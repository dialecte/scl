import type { IedClassification } from './classify-ieds.types'
import type { Scl } from '@/v2019C1/config'
import type { SsdExtractScope } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'

export type BoundIedsParams = {
	/** The scope an SSD extract writes: a Substation, a VoltageLevel or a Bay. */
	scopeRef: SsdExtractScope
}

/** The LNodes on one side of the scope tied to an IED, in document order. */
export type BoundLNodes = {
	/** The LNodes the IED implements: its LN named by their `lnUuid`, their name path, or the data of an unassigned one. */
	implements: readonly Scl.Ref<'LNode'>[]
	/** The LNodes whose specified naming (`LNodeSpecNaming@sIedName`) names the IED, implemented by another IED or by none. */
	specifies: readonly Scl.Ref<'LNode'>[]
}

/** How the LNodes tied to an IED sit: all written by the extract (`full`), or some not (`shared`). */
export type BoundIedAssignment = 'full' | 'shared'

export type BoundIed = IedClassification & {
	assignment: BoundIedAssignment
	/** The LNodes the extract writes tied to the IED. */
	inside: BoundLNodes
	/** The LNodes the extract does not write tied to the IED: none for a `full` IED. */
	outside: BoundLNodes
}

export type BoundIeds = {
	/** The IEDs tied to at least one LNode the extract writes, in document order. */
	ieds: readonly BoundIed[]
}

/** What ties one LNode to IEDs: the IED implementing it (its id) and the IED name its specified naming gives. */
export type LNodeTie = {
	lnode: Scl.Ref<'LNode'>
	implementer: string | undefined
	specifiedOn: string | undefined
}

export type FoldBoundIedsParams = {
	/** The ties of every LNode of the document, in document order. */
	ties: readonly LNodeTie[]
	/** The ids of the LNodes the extract writes. */
	carried: ReadonlySet<string>
	classifications: readonly IedClassification[]
}

export type SideOfParams = {
	/** The ties whose LNode the IED implements. */
	implemented: readonly LNodeTie[]
	/** The ties whose LNode is specified on the IED and implemented by another or none. */
	specified: readonly LNodeTie[]
	/** Which side of the scope a tie is kept for. */
	keep: (tie: LNodeTie) => boolean
}
