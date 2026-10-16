import type { SpecifiedDataflow } from '../../dataflow.types'

/**
 * A small SCD for the dataflow queries: a function holding a sender (`PTRC1`, mapped to the IED
 * `P1`) and a receiver (`XCBR1`, mapped to the IED `B1`), the IED `P1` publishing a GOOSE control
 * block `gcb1` that names `B1`, the IED `B1` holding the logical node `XCBR1`. Each slot replaces a
 * part of it.
 */
export type ScdSlots = {
	/** The attributes of the sender's LNode. */
	senderLNode?: string
	/** What the sender's LNode holds (its `LNodeSpecNaming`). */
	senderContent?: string
	/** The attributes of the receiver's LNode. */
	receiverLNode?: string
	/** The signals of the receiver: its `LNodeInputs` or `LNodeOutputs`. */
	signals?: string
	/** The logical nodes of `B1`'s logical device, after its LN0. */
	receiverLogicalNodes?: string
	/** The control blocks held by `P1`'s LN0. */
	controlBlocks?: string
	/** What follows the receiver's LNode in the function (LNodes, process resources). */
	functionExtras?: string
	/** What follows the substation in the document (a function template). */
	templates?: string
}

export type Implementation = SpecifiedDataflow['implementation']
export type Specification = SpecifiedDataflow['specification']

/** The signal side of a dataflow: what the signal says about itself. */
export type SignalSide = {
	signal: SpecifiedDataflow['signal']
	direction: SpecifiedDataflow['direction']
	specification: Specification
}

/** What a case expects of a dataflow: its signal side and/or a projection of its implementation. */
export type ExpectedDataflow = {
	expectedSignalSide?: SignalSide
	expectedImplementation?: Partial<SpecifiedDataflow['implementation']>
}
