import { CONTROL_BLOCK_TAGS } from './control-blocks.constants'

import { invariant } from '@dialecte/core/utils'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { DESCENDANTS } from '@/v2019C1/definition/constants.generated'
import { tuplePairTargeting } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-pair-targeting'

import type { Registration } from '../dataflow.types'

/**
 * The elements registering a subscriber on a control block (`IEDName`, `ClientLN`): the elements
 * below a control block that name their target by a tuple.
 */
export const REGISTRATION_TAGS: ReadonlySet<string> = new Set(
	CONTROL_BLOCK_TAGS.flatMap((tagName) => DESCENDANTS[tagName as keyof typeof DESCENDANTS]).filter(
		(tagName) => tagName in TUPLE_REFERENCE_PAIRS,
	),
)

/** The registrations from the most to the least precise. */
export const REGISTRATION_PRECISION_ORDER: readonly Registration['names'][] = ['ln', 'ld', 'ap']

/**
 * The rank of a registration whose precision cannot be read (invalid input, such as a `ClientLN`
 * naming no logical device): it is still listed, at the least precise rank.
 */
export const LEAST_PRECISE_REGISTRATION: Registration['names'] =
	REGISTRATION_PRECISION_ORDER[REGISTRATION_PRECISION_ORDER.length - 1]

/**
 * The attribute of a registration naming the access point it registers: the one the tuple reference
 * of an `IEDName` naming an access point reads (a `ClientLN` names its access point by the same
 * attribute). Only a client logical node held directly by an access point is matched by it.
 */
export const REGISTRATION_ACCESS_POINT_ATTRIBUTE: string = readAccessPointAttribute()

function readAccessPointAttribute(): string {
	const pair = tuplePairTargeting({ pairs: TUPLE_REFERENCE_PAIRS.IEDName, kind: 'ap' })
	invariant(pair?.tuple.accessPoint, {
		key: 'ASSERTION_FAILED',
		detail: 'an IEDName names the access point it registers',
	})
	return pair.tuple.accessPoint
}
