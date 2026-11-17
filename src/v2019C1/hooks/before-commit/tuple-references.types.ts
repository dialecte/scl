import type { TupleReferencePair } from '@/v2019C1/constants'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type { AnyRawRecord } from '@dialecte/core'

/** A record the transaction wrote, as it was before (none when it created it) and as the commit leaves it. */
export type RecordChange = { before: AnyRawRecord | undefined; after: AnyRawRecord }

/**
 * What the commit does to one pair of a reference: give it the uuid its names name (`fill`), write its names from its
 * new uuid (`follow-uuid`), or check that its new names still name what its uuid names (`confirm`).
 */
export type PairAction = 'fill' | 'follow-uuid' | 'confirm'

/**
 * A reference the commit writes, with the action on each of its pairs; a fill taking any uuid its names give, or only
 * one of a target the transaction created or renamed (`touched`: a reference the transaction did not write).
 */
export type ReferenceWork = {
	record: AnyRawRecord
	pairs: { pair: TupleReferencePair; action: PairAction }[]
	fillsFrom: 'any' | 'touched'
}

/**
 * The tuple targets the transaction created or renamed: their ids (a renamed one standing for everything in it), and
 * the target tags a reference may now name by its names.
 */
export type TouchedTargets = { roots: ReadonlySet<string>; tags: ReadonlySet<string> }

/** A tuple target of the document by its uuid: its tag, its address parts, its address, its id and its ancestors' ids. */
export type IndexedTarget = {
	tagName: string
	parts: TupleTargetParts
	address: string
	lineage: ReadonlySet<string>
}

/** The tuple targets of the tags read: by address key (an address two targets share left out), and by uuid. */
export type TupleTargetIndex = {
	byAddress: ReadonlyMap<string, string>
	byUuid: ReadonlyMap<string, IndexedTarget>
}
