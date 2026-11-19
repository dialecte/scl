/** The tags of a data's parent data: the nearest of them above a `DOS` / `SDS` / `DAS` is its parent. */
export const DATA_PARENT_TAGS: ReadonlySet<string> = new Set(['DOS', 'SDS'])

/** The tag of the element a data sits in: the nearest above it is its `LNode`. */
export const LNODE_TAGS: ReadonlySet<string> = new Set(['LNode'])

/** What is read under each root: the data the rules answer for and the `Private` they sit in. */
export const SUBTREE_COLLECT = ['DOS', 'SDS', 'DAS', 'Private'] as const
