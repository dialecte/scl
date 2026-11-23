import type { KEPT_VALUE_REASONS } from './unlock-lnode.constants'
import type { Scl } from '@/v2019C1/config'

export type UnlockLNodeParams = { lnode: Scl.Ref<'LNode'> }

/** Why an unlock keeps the value of a `DAI` its specification names: see `unlockLNode`. */
export type KeptValueReason = (typeof KEPT_VALUE_REASONS)[number]

/** A `DAI` an unlock leaves with its value, the `DAS` naming it, and why. */
export type KeptValue = {
	dai: Scl.Ref<'DAI'>
	specification: Scl.Ref<'DAS'>
	reason: KeptValueReason
}

/** An element an unlock removed: a `Val`, or a data instance it left with nothing else on it. */
export type RemovedData = Scl.Ref<'Val' | 'DAI' | 'SDI' | 'DOI'>

/** What an unlock did to the data of the logical node implementing the LNode. */
export type UnlockLNodeResult = {
	/** Each element removed: a `Val`, then each `DAI` / `SDI` / `DOI` it left with nothing else on it, walking up. */
	removed: RemovedData[]
	/** Each `DAI` named by a `DAS` of the LNode whose value stays, with why. */
	kept: KeptValue[]
}
