/**
 * Source children whose counterpart is decided elsewhere, by source record id: the record id of the
 * instance child each lands on, or `undefined` for a child that is new whatever the instance holds.
 */
export type PinnedMatches = ReadonlyMap<string, string | undefined>
