import { invariant } from '@dialecte/core/utils'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { TUPLE_TARGET_TAGS_BY_KIND } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import { isControlBlockPair } from '@/v2019C1/extensions/reference/query/ied-tuple/is-control-block-pair'
import { tuplePairTargeting } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-pair-targeting'

import type { ControlBlockTuplePair } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'

/** The control blocks, read from the tuple references that name one. */
export const CONTROL_BLOCK_TAGS: readonly string[] = TUPLE_TARGET_TAGS_BY_KIND.get('cb') ?? []

/**
 * The tuple reference through which an ExtRef names the control block publishing its signal: the
 * pair whose targets are the control blocks.
 */
export const EXT_REF_CONTROL_BLOCK_PAIR: ControlBlockTuplePair = findControlBlockPair()

function findControlBlockPair(): ControlBlockTuplePair {
	const pair = tuplePairTargeting({ pairs: TUPLE_REFERENCE_PAIRS.ExtRef, kind: 'cb' })
	invariant(pair && isControlBlockPair(pair), {
		key: 'ASSERTION_FAILED',
		detail: 'an ExtRef names the control block publishing its signal',
	})
	return pair
}
