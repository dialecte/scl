import type { AnyRef, AnyTreeRecord } from '@dialecte/core'

/**
 * What an instance's selection of functional variants leaves out of its template: never added to it by an update, at
 * any depth. Empty when the instance selected nothing.
 */
export type VariantSelection = {
	/** The template's variants the instance did not select, as the template holds them. */
	variantsNotSelected: AnyRef[]
	/**
	 * The record ids of the template elements the selection leaves out, each with what it holds: what a comparison
	 * walking the template skips, a subtree at a time.
	 */
	leftOut: ReadonlySet<string>
	/**
	 * The record ids of every element inside what is left out, the elements of `leftOut` included: what a reader that
	 * does not walk the template (a reference found by what it names) asks.
	 */
	within: ReadonlySet<string>
}

/**
 * An application template holding functional variants, read once for every instance an operation compares with it:
 * its whole document as a tree, the tree parent of each node, each node by its uuid.
 */
export type VariantTemplate = {
	application: AnyTreeRecord
	documentTree: AnyTreeRecord
	parents: ReadonlyMap<string, AnyTreeRecord>
	byUuid: ReadonlyMap<string, AnyTreeRecord>
}

/**
 * A set of exclusive variants of the template the instance selected in: the one it selected and the others — none
 * selected for the sub-variants of a variant it did not select.
 */
export type ResolvedVariantSet = {
	selected: AnyTreeRecord | undefined
	notSelected: AnyTreeRecord[]
}
