import type { ControlBlockTuplePair } from './ied-tuple.types'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'

/** Whether a pair names a control block, the kind of which an attribute of the referrer tells. */
export function isControlBlockPair(pair: TupleReferencePair): pair is ControlBlockTuplePair {
	return pair.targetByAttribute !== undefined && pair.tuple.controlBlock !== undefined
}
