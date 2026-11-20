import type { Scl } from '@/v2019C1/config'

/** What `search` looks for: a term in the titles of the elements of some tags. */
export type SearchParams = {
	/** Looked for in each title, trimmed, case aside; an empty term finds nothing. */
	term: string
	/** The tags whose elements are searched (repeats count once). */
	tagNames: readonly Scl.ElementsOf[]
	/** The titles matched: `compact` (default, what a tree shows) or `full`, as `ofEach` gives them. */
	mode?: 'compact' | 'full'
	/** Tags whose elements, and everything below them, are left out of the hits. */
	omit?: readonly Scl.ElementsOf[]
	/**
	 * At most this many hits, the first ones in the answer's order: its whole part; none read at 0 or less; no cap when
	 * absent or not a finite number.
	 */
	limit?: number
}

/** One element whose title holds the term, with what a tree needs to reveal it. */
export type SearchHit = {
	tagName: string
	id: string
	/** Its title, as `ofEach` gives it in the mode asked. */
	title: string
	/** The ids of its ancestors from the root down, itself and transparent elements (`Private`) left out. */
	ancestorIds: string[]
	/**
	 * The same ancestors as refs (`{ tagName, id }`), in the same order: `info.ofEach(hit.ancestors)` titles the hit's
	 * path in one call.
	 */
	ancestors: SearchAncestor[]
}

/**
 * An ancestor of a search hit as a ref, its id always set: `info.ofEach` and the `query.any` verbs take it as it is.
 * Not `Scl.Ref`: that type leaves the id optional for singleton tags and takes a tag name narrowed to one tag.
 */
export type SearchAncestor = { tagName: string; id: string }
