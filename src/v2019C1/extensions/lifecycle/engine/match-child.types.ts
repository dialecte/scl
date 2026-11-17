import type { AnyTreeRecord } from '@dialecte/core'

/**
 * Source children whose counterpart is decided elsewhere, by source record id: the record id of the
 * instance child each lands on, or `undefined` for a child that is new whatever the instance holds.
 */
export type PinnedMatches = ReadonlyMap<string, string | undefined>

/**
 * The instance child a source child pairs with. `pairedByName` is set when a reference paired by the names of what it
 * names, its uuids disagreeing: the placeholder lineage of the project's target that let it. `pairedAmongTwins` is set
 * when several instance references name the very same thing: paired in order.
 */
export type ChildMatch = {
	record: AnyTreeRecord
	pairedByName?: string
	pairedAmongTwins?: true
	/** Paired by the key pass on this key (an IED element whose lineage names nothing the template holds). */
	pairedByKey?: string
}

/** How a reference of the instance is identified for a pairing: by the uuids it names, or by its names. */
export type ReferenceIdentityOf = (candidate: AnyTreeRecord) => Promise<string | undefined>
