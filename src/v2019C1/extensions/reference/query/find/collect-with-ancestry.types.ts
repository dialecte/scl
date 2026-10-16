import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord, AnyTrackedRecord } from '@dialecte/core'

/**
 * The part of a subtree to read, by tag, from the root down: `true` keeps the element and every
 * element of the dialecte below it (what a vendor holds inside a `Private` is not an element of the
 * dialecte and is not read), `false` leaves it out, an object keeps the element and, of what it
 * holds, what the object names. An element no entry names is left out: `Private` is gone through,
 * and an element that may hold its own tag keeps the select it was read with for those. `where` and
 * `recursive`, the options of a `getTree` select, are not tags and are refused.
 */
export type CollectSelect = { readonly [tagName: string]: boolean | CollectSelect } & {
	where?: never
	recursive?: never
}

/** How the walk reads the children of an element: the select below it, and whether an element holding its own tag reads it as it was read. */
export type SelectState = { select: CollectSelect | undefined; recursive: boolean }

/** A child the select keeps, with the state its own children are read with. */
export type SelectedChild = { record: AnyRawRecord; tagName: string; state: SelectState }

/**
 * What `collectWithAncestry` reads: the subtree of a `root` (the document root when omitted),
 * whole or, with a `select`, the part of it the select names.
 */
export type CollectWithAncestryParams = {
	root?: Scl.Ref<Scl.ElementsOf>
	select?: CollectSelect
}

/**
 * `findDescendants` of a query, for tags known at run time: typed over the tags of the dialecte the
 * call costs thousands of type instantiations for a result read as records by tag name.
 */
export type TagCollectingQuery = {
	findDescendants(
		ref: Scl.Ref<Scl.ElementsOf>,
		options: { collect: readonly string[] },
	): Promise<Readonly<Record<string, readonly AnyTrackedRecord[]>>>
}

/** The same, the root given. */
export type CollectFromRootParams = CollectWithAncestryParams & { root: Scl.Ref<Scl.ElementsOf> }

/**
 * A subtree read once and laid flat: its elements in document order, the records above each
 * looked up in memory.
 */
export type CollectedWithAncestry = {
	/** The root and every element read below it, a parent before its children, siblings in the sequence the dialecte declares for the children of their parent (siblings of a tag in the order they are stored). */
	records: readonly AnyRawRecord[]
	/**
	 * The records above an element, outermost first (the document root first, the element's parent
	 * last). Below the root, transparent wrappers (`Private`) are not part of it; the root's own
	 * ancestors are `findAncestors` as it gives them. Empty for an id that was
	 * not read.
	 */
	ancestryOf: (id: string) => readonly AnyRawRecord[]
}
