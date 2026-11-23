import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { TupleReferencePair } from '@/v2019C1/constants'

/** The tags of a logical node an LNode is bound to. */
export const LOGICAL_NODE_TAG_NAMES: ReadonlySet<string> = new Set(['LN', 'LN0'])

/** The tag of the element a release writes on. */
export const LNODE_TAG = 'LNode'

/** The pair an LNode names the logical node implementing it by, read from the reference registry. */
export const LNODE_BINDING_PAIR: TupleReferencePair = TUPLE_REFERENCE_PAIRS.LNode[0]

/**
 * The attribute each part of an LNode's binding is written on, read from the reference registry
 * ({@link LNODE_BINDING_PAIR}): its uuid, the IED it names and each part of the address below it.
 */
export const LNODE_BINDING_ATTRIBUTES = {
	lnUuid: LNODE_BINDING_PAIR.attribute.uuid,
	iedName:
		'attribute' in LNODE_BINDING_PAIR.tuple.ied
			? LNODE_BINDING_PAIR.tuple.ied.attribute
			: undefined,
	ldInst: LNODE_BINDING_PAIR.tuple.lDevice,
	prefix: LNODE_BINDING_PAIR.tuple.prefix,
	lnClass: LNODE_BINDING_PAIR.tuple.lnClass,
	lnInst: LNODE_BINDING_PAIR.tuple.lnInst,
} as const satisfies Record<string, string | undefined>
