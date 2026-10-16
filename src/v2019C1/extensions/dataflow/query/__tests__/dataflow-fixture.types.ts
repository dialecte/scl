import type { Dataflow, SpecifiedDataflow } from '../../dataflow.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

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
	/** The control blocks held by `B1`'s LN0. */
	receiverControlBlocks?: string
	/** The access points `B1` holds after `AP1`. */
	receiverAccessPoints?: string
	/** What `B1`'s access point holds after its server: logical nodes of its own. */
	receiverAccessPointContent?: string
	/** The logical nodes of `B1`'s logical device, after its LN0. */
	receiverLogicalNodes?: string
	/** What `P1`'s logical node `PTRC1` holds (its inputs). */
	senderLogicalNodeContent?: string
	/** The control blocks held by `P1`'s LN0. */
	controlBlocks?: string
	/** The IEDs held after `B1`. */
	extraIeds?: string
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

/**
 * What a case expects of one dataflow of a list: its kind, and (when given) its signal, the ExtRef /
 * ExtCtrl implementing it and a projection of its implementation; what is left out is not checked.
 */
export type ExpectedEntry = {
	kind: Dataflow['kind']
	signal?: SpecifiedDataflow['signal']
	element?: Scl.Ref<'ExtRef' | 'ExtCtrl'> | undefined
	implementation?: Partial<Implementation>
}

/** The query and the signal whose dataflow `ofSourceRef` / `ofControlRef` and `all` must give alike. */
export type ParityParams = {
	query: Core.Query<Config>
	signal: Scl.Ref<'SourceRef' | 'ControlRef'>
}
