import type { KeptAttributeReason } from './diff.types'

/** What the project owns on one of its elements, against a template. */
export type ProjectOwnedAttributes = {
	/** Neither compared into the decisions nor written by an update. */
	attributes: ReadonlySet<string>
	/** Among `attributes`, those whose difference the report still lists as kept, with why. */
	listedAsKept: ReadonlyMap<string, KeptAttributeReason>
}
