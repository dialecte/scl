import type {
	KeptRegistration,
	RegistrationOperation,
} from '../query/plan-subscription-bookkeeping.types'
import type { Scl } from '@/v2019C1/config'

export type UnsubscribeParams = {
	extRefs: readonly Scl.Ref<'ExtRef'>[]
	/** The ExtRefs implementing the same data object signal go too. Default true. */
	withCompanions?: boolean
}

export type UnsubscribeResult = {
	/** Kept (they hold an internal address), their binding cleared. */
	unbound: Scl.Ref<'ExtRef'>[]
	/** Removed (no internal address). */
	removed: Scl.Ref<'ExtRef'>[]
	/** Signals the kept ExtRefs implemented: no longer linked. */
	unlinked: Scl.Ref<'SourceRef'>[]
	registrations: RegistrationOperation[]
	/** The `setSrcRef` values cleared, their LGOS / LSVS kept. */
	supervisions: Scl.Ref<'DAI'>[]
	kept: KeptRegistration[]
}

/** Why an unsubscribe is refused. */
export type UnsubscribeRefusalMeta = { reason: 'eng-right-fix'; ied: Scl.Ref<'IED'> }
