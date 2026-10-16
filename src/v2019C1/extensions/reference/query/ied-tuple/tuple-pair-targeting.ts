import { tupleTargetKind } from './tuple-target-kind'

import type { TupleTargetKind } from './ied-tuple.types'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'

/** The pair, among those of a referrer, naming a target of `kind`: a logical node, a control block... */
export function tuplePairTargeting(params: {
	pairs: readonly TupleReferencePair[]
	kind: TupleTargetKind
}): TupleReferencePair | undefined {
	const { pairs, kind } = params
	return pairs.find((pair) => tupleTargetKind(pair.tuple) === kind)
}
