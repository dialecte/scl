import type { ConfRevBump, OrderChange } from './diff.types'

/**
 * The configuration revisions an apply raises, written once its walk is done: a control block is reconciled after the
 * data set it names, and would otherwise write the template's revision over the raised one (`createConfRevBumpQueue`).
 */
export type ConfRevBumpQueue = {
	defer: (bumps: readonly ConfRevBump[]) => void
	list: () => readonly ConfRevBump[]
	/** Record that the records of a data set written again in order took new ids (old id -> new id). */
	moved: (ids: ReadonlyMap<string, string>) => void
	/** Every record id a data set written again in order replaced, with the id of its copy. */
	movedIds: () => ReadonlyMap<string, string>
}

/** What changes in a matched data set's entries, for its report node: see `readDataSetChange`. */
export type DataSetChange = { orderChange?: OrderChange; confRevBumps?: ConfRevBump[] }
