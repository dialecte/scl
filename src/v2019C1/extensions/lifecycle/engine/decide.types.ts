/**
 * The record ids reconcile is allowed to touch, derived from the accepted
 * groups. `sourceIds` gate updates/adds (matched by the source element);
 * `instanceIds` gate deletes (matched by the instance element).
 */
export type AcceptedIds = {
	sourceIds: ReadonlySet<string>
	instanceIds: ReadonlySet<string>
}

/** source-element id -> user-edited values for that element's editable attributes. */
export type CollisionOverrides = ReadonlyMap<string, Record<string, string>>
