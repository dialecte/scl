import { PAIRS_BY_REF, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'

import type { RefPairEntry } from '@/v2019C1/extensions/reference/constants'

/**
 * Per tag, the references that name the element implementing an LNode's signal by an address
 * (`ied-address` pairs: a `SourceRef` to its `ExtRef`, a `ControlRef` to its `ExtCtrl`). Read from
 * the reference registry.
 */
export const SIGNAL_ADDRESS_PAIRS_BY_REF: ReadonlyMap<string, readonly RefPairEntry[]> = new Map(
	[...PAIRS_BY_REF].flatMap(([tagName, pairs]) => {
		const addressPairs = pairs.filter((pair) => pair.resolution === RESOLUTION_TYPE.iedAddress)
		return addressPairs.length > 0 ? [[tagName, addressPairs] as const] : []
	}),
)
