import type { ReferencePair } from '@/v2019C1/extensions/reference/constants/types'
import type { AnyRawRecord } from '@dialecte/core'

/** A pair of a reference, the records above the referrer, its target and the records above the target, outermost first. */
export type TargetInScopeParams = {
	pair: ReferencePair
	referrerAncestry: readonly AnyRawRecord[]
	target: AnyRawRecord
	targetAncestry: readonly AnyRawRecord[]
}
