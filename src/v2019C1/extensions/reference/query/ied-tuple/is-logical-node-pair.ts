import type { LogicalNodeTuplePair } from './ied-tuple.types'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'

/** Whether a pair names a logical node by an IED attribute, its logical device and its class. */
export function isLogicalNodePair(pair: TupleReferencePair): pair is LogicalNodeTuplePair {
	const { ied, lDevice, lnClass } = pair.tuple
	return 'attribute' in ied && lDevice !== undefined && lnClass !== undefined
}
