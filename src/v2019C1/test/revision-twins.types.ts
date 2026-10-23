import type { REVISION_TWIN_INSTANCES, REVISION_TWINS } from './revision-twins.constants'

/** A revision twin, by its key in `REVISION_TWINS`. */
export type RevisionTwin = keyof typeof REVISION_TWINS

/** A revision twin whose project instance is committed beside it, by its key in `REVISION_TWIN_INSTANCES`. */
export type RevisionTwinWithInstance = keyof typeof REVISION_TWIN_INSTANCES

/** The revision of a twin: each has two. */
export type TwinRevision = 1 | 2
