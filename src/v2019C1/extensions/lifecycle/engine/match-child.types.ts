import type { AnyTreeRecord } from '@dialecte/core'

/**
 * Source children whose counterpart is decided elsewhere, by source record id: the record id of the
 * instance child each lands on, or `undefined` for a child that is new whatever the instance holds.
 */
export type PinnedMatches = ReadonlyMap<string, string | undefined>

/**
 * The instance child a source child pairs with. `pairedByName` is set when a reference paired by the names of what it
 * names, its uuids disagreeing: the placeholder lineage of the project's target that let it.
 */
export type ChildMatch = { record: AnyTreeRecord; pairedByName?: string }
