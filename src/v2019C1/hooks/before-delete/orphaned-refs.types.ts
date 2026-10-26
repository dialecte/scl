import type { Scl } from '@/v2019C1/config'
import type { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

/** The uuid pairs of one reference tag. */
export type RefPairs = (typeof UUID_REFERENCE_PAIRS)[keyof typeof UUID_REFERENCE_PAIRS]

/**
 * A reference outside a deleted subtree naming an element of it, and what the deletion does to it: `cleared` (its
 * `attributes` removed, the element kept) or `deleted`.
 */
export type OrphanedRef = {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	effect: 'deleted' | 'cleared'
	/** The uuid, path and companion attributes naming the subtree. */
	attributes: ReadonlySet<string>
}
