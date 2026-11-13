import type { TreeEntry } from './tree-entries.types'

export type CollectTupleViolationsParams = {
	element: TreeEntry
	/** Every element of the document carrying a uuid, by that uuid. */
	elementsByUuid: ReadonlyMap<string, TreeEntry[]>
	/** The names of the IEDs the document holds: a uuid naming an element of another IED is outside the document. */
	iedNames: ReadonlySet<string>
}
