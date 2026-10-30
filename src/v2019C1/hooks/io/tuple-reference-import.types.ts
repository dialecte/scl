import type { TupleReferencePair } from '@/v2019C1/constants'
import type { IncoherentReferenceDiagnostic } from '@/v2019C1/errors/import-diagnostics.types'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type { AnyRawRecord, RecordPatch } from '@dialecte/core'

export type TupleReferenceImport = {
	/** Record one standardized record of the import pass, with its still-open parents. */
	collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void
	/**
	 * After the pass: the uuid of each tuple reference written without it, from the element its names
	 * name; the names of each one whose uuid names another element, from that element.
	 */
	resolve(): { updates: RecordPatch[]; diagnostics: IncoherentReferenceDiagnostic[] }
}

/** An element a tuple reference may name, kept by its uuid: its tag, its record id, its address and the parts of it. */
export type CollectedTupleTarget = {
	tagName: string
	recordId: string
	address: string
	parts: TupleTargetParts
}

/**
 * A pair of a tuple reference whose names give an address: that address, the uuid the reference
 * holds for it (`undefined` when written without) and the tags of the elements it may point at (one,
 * when its own attribute says which).
 */
export type CollectedTuplePair = {
	pair: TupleReferencePair
	address: string
	uuid: string | undefined
	targetTags: readonly string[]
}

/**
 * A tuple reference with at least one pair whose names give an address, kept from the pass: the
 * record as read, its ancestors (outermost first) and those pairs, in the order of
 * `TUPLE_REFERENCE_PAIRS`.
 */
export type PendingTupleReferrer = {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
	pairs: readonly CollectedTuplePair[]
}

/**
 * How a pair holding a uuid naming an element of the file reads against that element: `follows` (its
 * names name it), `disagrees` (its names name another element, or none, and can be written from
 * it), `cannot-follow` (the element is of a kind the reference cannot point at, or in another IED
 * than the one the reference names by where it sits, or the names disagree on a `followsOnly` pair,
 * whose names another writer gives).
 */
export type TuplePairReading = 'follows' | 'disagrees' | 'cannot-follow'

/** A pair holding a uuid (read or filled) that names an element of the file, and how it reads against it. */
export type ReadTuplePair = {
	collected: CollectedTuplePair
	uuid: string
	target: CollectedTupleTarget
	reading: TuplePairReading
}
