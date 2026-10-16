import { readAttribute } from '@/v2019C1/helpers'

import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type { AnyRawRecord } from '@dialecte/core'

/** Whether a pair names a referrer's target: none of its `onlyWithout` attributes is set. */
export function tuplePairApplies(params: {
	record: AnyRawRecord
	pair: TupleReferencePair
}): boolean {
	const { record, pair } = params
	return !pair.onlyWithout?.some(
		(name) => readAttribute({ record, name, defaults: 'none', fullObject: true }) !== undefined,
	)
}
