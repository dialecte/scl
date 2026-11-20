import type { CollectedWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'
import type { AnyRawRecord } from '@dialecte/core'

/** An element of the document by its tag and record id. */
export type MovedRef = { tagName: string; id: string }

/** An element whose parent at the end of the transaction is not the one it had first: where it came from and went. */
export type MovedRecord = {
	ref: MovedRef
	from: MovedRef
	to: MovedRef
}

/**
 * What the commit knows of the places of the moved elements: the document as read once, with ancestries, and the records
 * the transaction's operations leave by id (a `Private` the read goes through is found there).
 */
export type MovePlaces = {
	moved: ReadonlyMap<string, MovedRecord>
	document: CollectedWithAncestry
	/** The records of `document` by id. */
	read: ReadonlyMap<string, AnyRawRecord>
	/** The children of each element of `document`, by its id and through the transparent wrappers it goes through. */
	childrenOf: ReadonlyMap<string, readonly AnyRawRecord[]>
	written: ReadonlyMap<string, AnyRawRecord>
	/** Each record the transaction updated, as it stood before its first update: the names it carried before. */
	before: ReadonlyMap<string, AnyRawRecord>
	/** Each element of a moved subtree, by id, with the nearest move holding it. */
	movedBy: ReadonlyMap<string, MovedRecord>
}
