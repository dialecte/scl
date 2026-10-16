import type { Scl } from '@/v2019C1/config'
import type { AnyDialecteConfig, AnyRawRecord, TreeSelect } from '@dialecte/core'

/** A `getTree` select, read from the root. */
export type CollectSelect = TreeSelect<AnyDialecteConfig, string>

/**
 * What `collectWithAncestry` reads: the subtree of a `root` (the document root when omitted),
 * whole or, with a `select`, the part of it the select names.
 */
export type CollectWithAncestryParams = {
	root?: Scl.Ref<Scl.ElementsOf>
	select?: CollectSelect
}

/**
 * A subtree read once and laid flat: its elements in document order, the records above each
 * looked up in memory.
 */
export type CollectedWithAncestry = {
	/** The root and every element read below it, a parent before its children, siblings in the order the tree gives them. */
	records: readonly AnyRawRecord[]
	/**
	 * The records above an element, outermost first (the document root first, the element's parent
	 * last). Below the root, transparent wrappers (`Private`) are not part of it, as `getTree` unwraps
	 * them; the root's own ancestors are `findAncestors` as it gives them. Empty for an id that was
	 * not read.
	 */
	ancestryOf: (id: string) => readonly AnyRawRecord[]
}
