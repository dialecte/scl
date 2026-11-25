import type { TupleReferencePair } from '@/v2019C1/constants'
import type { AnyRawRecord } from '@dialecte/core'

/** A record the transaction wrote, as it was before (none when it created it) and as the commit leaves it. */
export type RecordChange = { before: AnyRawRecord | undefined; after: AnyRawRecord }

/**
 * What the commit does to one pair of a reference: give it the uuid its names name (`fill`), write its names from its
 * new uuid (`follow-uuid`), or check that its new names still name what its uuid names (`confirm`).
 */
export type PairAction = 'fill' | 'follow-uuid' | 'confirm'

/**
 * A reference the commit writes, with the action on each of its pairs; a fill taking any uuid its names give (a
 * reference whose names the transaction edited), only one of a target the transaction created (`created`: a reference
 * the transaction created, never bound to an element that was there before), or only one of a target the transaction
 * created, renamed or moved and its names did not name before (`touched`: a reference the transaction did not write).
 */
export type ReferenceWork = {
	record: AnyRawRecord
	pairs: { pair: TupleReferencePair; action: PairAction }[]
	fillsFrom: 'any' | 'created' | 'touched'
}

/**
 * The tuple targets the transaction created, renamed or moved: their ids (a renamed one standing for everything in it), the
 * ids of the targets and IEDs it created, and the target tags a reference may now name by its names.
 */
export type TouchedTargets = {
	roots: ReadonlySet<string>
	created: ReadonlySet<string>
	tags: ReadonlySet<string>
}

/** By reference id, the uuid each of its pairs' names named before the transaction, by uuid attribute. */
export type NamedBefore = ReadonlyMap<string, ReadonlyMap<string, string>>
