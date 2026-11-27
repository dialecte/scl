import type { DataflowContext } from './dataflow-context.types'
import type { ControlBlockNode, IedNode } from './ied-section.types'
import type { KEPT_REGISTRATION_REASONS } from './plan-subscription-bookkeeping.constants'
import type { Scl } from '@/v2019C1/config'

export type KeptRegistrationReason = (typeof KEPT_REGISTRATION_REASONS)[number]

/** A registration an ended subscription removes, or clears to its IED. */
export type RegistrationOperation =
	| { element: Scl.Ref<'IEDName' | 'ClientLN'>; effect: 'deleted' }
	| { element: Scl.Ref<'IEDName' | 'ClientLN'>; effect: 'cleared'; attributes: readonly string[] }

/** A supervision value an ended subscription clears: the `setSrcRef` value, its logical node kept. */
export type SupervisionOperation = { dai: Scl.Ref<'DAI'>; val: Scl.Ref<'Val'> }

export type KeptRegistration = {
	element: Scl.Ref<'IEDName' | 'ClientLN'>
	why: KeptRegistrationReason
}

/** What a set of ended subscriptions leaves to do on the control blocks they named. */
export type SubscriptionBookkeeping = {
	registrations: RegistrationOperation[]
	supervisions: SupervisionOperation[]
	kept: KeptRegistration[]
}

export type PlanSubscriptionBookkeepingParams = {
	/** The pre-read state of the call: nothing is read again, nothing kept after it. */
	context: DataflowContext
	/** The ExtRefs whose subscription ends, or control blocks removed with their publisher. */
	ending: readonly (IedNode<'ExtRef'> | ControlBlockNode)[]
}

/** The ending ExtRefs of one subscriber IED naming one control block. */
export type EndedSubscription = {
	controlBlock: ControlBlockNode
	subscriber: Scl.Ref<'IED'>
	extRefs: IedNode<'ExtRef'>[]
}
