import type { Scl } from '@/v2019C1/config'
import type { REFERENCE_TAGS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

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
	/** The record of the deleted subtrees it names: why it goes. Absent on a reference built outside a delete. */
	cause?: string
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
	/**
	 * Per record the cascade takes or clears beyond the roots' subtrees, the record of those subtrees it goes with:
	 * a reference the record named, walked back through the rounds to the subtree that started it.
	 */
	causeById: ReadonlyMap<string, string>
	deleted: Scl.TrackedRecord<Scl.ElementsOf>[]
	within: Scl.RawRecord<Scl.ElementsOf>[]
	cleared: OrphanedRef[]
}

/**
 * What a delete removes, as the references outside read it: the record ids, the records by id and by their uuid, the names of the
 * IEDs it removes whole, and the tags of the records it removes that carry a uuid.
 */
export type DeletedSubtree = {
	ids: ReadonlySet<string>
	byId: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	byUuid: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	iedNames: ReadonlySet<string>
	uuidTags: ReadonlySet<string>
}

/** The records of one reference tag naming, by a uuid attribute of its pairs, a record of deleted subtrees. */
export type UuidReferrers = {
	refTagName: (typeof REFERENCE_TAGS)[number]
	refRecords: Scl.TrackedRecord<Scl.ElementsOf>[]
}
