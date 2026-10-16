import { CONTROL_BLOCK_TAGS } from './control-blocks.constants'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { DESCENDANTS } from '@/v2019C1/definition/constants.generated'

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
export const REGISTRATION_PRECISION_ORDER: readonly Registration['names'][] = ['ln', 'ld', 'ied']
