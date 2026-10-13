import type { Scl } from '@/v2019C1/config'
import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'

/**
 * Document-wide facts a state rule needs, read once per `of` / `ofEach` call and shared by the
 * elements of that call (an `ofEach` over a tree classifies the IEDs once, not once per LNode).
 */
export type InfoContext = {
	iedKindById: () => Promise<ReadonlyMap<string, IedKind>>
	lnByUuid: () => Promise<ReadonlyMap<string, Scl.Ref<'LN' | 'LN0'>>>
}
