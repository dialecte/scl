/**
 * The record ids of a set of groups — the accepted ones: those reconcile is allowed to touch; the
 * skipped ones: those a first placement leaves out. `sourceIds` gate updates/adds (matched by the source element);
 * `instanceIds` gate deletes (matched by the instance element).
 */
export type AcceptedIds = {
	sourceIds: ReadonlySet<string>
	instanceIds: ReadonlySet<string>
	/** Among `sourceIds`, those of the elements whose type change the groups carry: the types an update brings. */
	typeChangeIds: ReadonlySet<string>
}

/** The ids of a set of groups as they are collected: see {@link AcceptedIds}. */
export type CollectedIds = {
	sourceIds: Set<string>
	instanceIds: Set<string>
	typeChangeIds: Set<string>
}

/** source-element id -> user-edited values for that element's editable attributes. */
export type CollisionOverrides = ReadonlyMap<string, Record<string, string>>
