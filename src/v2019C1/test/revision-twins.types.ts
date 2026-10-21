import type { REVISION_TWINS } from './revision-twins.constants'

/** A revision twin, by its key in `REVISION_TWINS`. */
export type RevisionTwin = keyof typeof REVISION_TWINS

/** The revision of a twin: each has two. */
export type TwinRevision = 1 | 2
