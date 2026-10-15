import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type { AnyRawRecord } from '@dialecte/core'

/** Whether a pair names a referrer's target: none of its `onlyWithout` attributes is set. */
export function tuplePairApplies(params: {
	record: AnyRawRecord
	pair: TupleReferencePair
}): boolean {
	const { record, pair } = params
	return !pair.onlyWithout?.some((name) => readRawAttribute({ record, name }) !== undefined)
}
