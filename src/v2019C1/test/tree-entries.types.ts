import type { AnyTreeRecord } from '@dialecte/core'

/** An element of a record tree, with the elements above it. */
export type TreeEntry = {
	readonly record: AnyTreeRecord
	/** Its ancestors, the root first: empty for the root. */
	readonly ancestors: readonly AnyTreeRecord[]
}
