import type {
	KeptRegistration,
	RegistrationOperation,
} from '../query/plan-subscription-bookkeeping.types'
import type { Scl } from '@/v2019C1/config'

export type KeptCleanupReason = 'fixed' | 'not-modifiable' | 'engright' | 'used'

export type KeptCleanup = {
	element: Scl.Ref<'FCDA' | 'DataSet' | 'GSEControl' | 'SampledValueControl' | 'ReportControl'>
	why: KeptCleanupReason
}

export type UnsubscribeParams = {
	extRefs: readonly Scl.Ref<'ExtRef'>[]
	/** The ExtRefs implementing the same data object signal go too. Default true. */
	withCompanions?: boolean
	/** Remove data only subscribers use. Default `subscriptions`. */
	cleanup?: 'subscriptions' | 'unused-data'
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
	kept: (KeptRegistration | KeptCleanup)[]
	/** Removed data-set entries. */
	fcdas: Scl.Ref<'FCDA'>[]
	/** Removed data sets. */
	dataSets: Scl.Ref<'DataSet'>[]
	/** Removed control blocks. */
	controlBlocks: Scl.Ref<'GSEControl' | 'SampledValueControl' | 'ReportControl'>[]
	/** Configuration revisions raised by data-set structure or reference changes. */
	confRevs: {
		controlBlock: Scl.Ref<'GSEControl' | 'SampledValueControl' | 'ReportControl'>
		from: string
		to: string
	}[]
}

/** Why an unsubscribe is refused. */
export type UnsubscribeRefusalMeta = { reason: 'eng-right-fix'; ied: Scl.Ref<'IED'> }
