import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { TupleReferencePair } from '@/v2019C1/constants'

/** The tags of a logical node an LNode is bound to. */
export const LOGICAL_NODE_TAG_NAMES: ReadonlySet<string> = new Set(['LN', 'LN0'])

/** The pair an LNode names the logical node implementing it by, read from the reference registry. */
export const LNODE_BINDING_PAIR: TupleReferencePair = TUPLE_REFERENCE_PAIRS.LNode[0]
