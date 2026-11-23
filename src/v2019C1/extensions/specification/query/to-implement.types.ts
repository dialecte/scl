import type { TO_IMPLEMENT_REASON } from './to-implement.constants'
import type { Scl } from '@/v2019C1/config'

export type ToImplementParams = { ied: Scl.Ref<'IED'> }

export type ToImplementReason = (typeof TO_IMPLEMENT_REASON)[keyof typeof TO_IMPLEMENT_REASON]

/** Another real IED implementing LNodes specified on the same specification IED names. */
export type OtherImplementer = { ied: Scl.Ref<'IED'>; name: string }

export type ToImplement = {
	/** The specification IED names of the LNodes the IED implements, sorted. */
	specifiedAs: string[]
	/** The LNodes specified on those names that no real IED implements, in document order. */
	lnodes: Scl.Ref<'LNode'>[]
	/** The other real IEDs implementing LNodes specified on those names, in document order. */
	otherImplementers: OtherImplementer[]
	/** Set when the lists are empty without being looked for. */
	reason?: ToImplementReason
}
