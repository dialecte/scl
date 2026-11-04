import type { Scl } from '@/v2019C1/config'
import type { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

/** The uuid pairs of one reference tag. */
export type RefPairs = (typeof UUID_REFERENCE_PAIRS)[keyof typeof UUID_REFERENCE_PAIRS]

/**
 * A reference outside deleted subtrees naming an element of them, and what the deletion does to it: `cleared` (its
 * `attributes` removed, the element kept) or `deleted`.
 */
export type OrphanedRef = {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	effect: 'deleted' | 'cleared'
	/** The uuid, path and companion attributes naming the subtrees. */
	attributes: ReadonlySet<string>
}

/**
 * Everything deleting some elements (the roots) does beyond their subtrees: the references deleted, the containers
 * those deletions leave holding nothing, and what refers to those containers in turn (`deleted`, the roots left out,
 * and what a delete takes by itself: a record inside a deleted reference is not listed); the records inside each
 * deleted reference, the reference itself left out (`within`); the references cleared (`cleared`). `gone` holds every
 * record id that disappears, the roots' subtrees and `within` included.
 */
export type DeleteCascade = {
	gone: ReadonlySet<string>
	deleted: Scl.TrackedRecord<Scl.ElementsOf>[]
	within: Scl.RawRecord<Scl.ElementsOf>[]
	cleared: OrphanedRef[]
}
