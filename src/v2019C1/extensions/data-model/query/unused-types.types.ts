import type { Config, Scl } from '@/v2019C1/config'
import type { TypeIdTarget } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * The type names a transaction stopped being named by: per name, the tags of type that may carry it (the targets
 * the referrer's pairs allow, `when` ignored).
 */
export type LostTypeNames = ReadonlyMap<string, readonly TypeIdTarget[]>

/** A type the commit prunes: its root, then every record of its subtree (root first). */
export type PrunedTypeTree = {
	root: Scl.TrackedRecord<Scl.ElementsOf>
	records: Scl.RawRecord<Scl.ElementsOf>[]
}

/** What the document no longer needs: the types to delete, and every record id gone (the ones given plus theirs). */
export type UnusedTypes = {
	trees: PrunedTypeTree[]
	gone: ReadonlySet<string>
}

/** The reads of one pass: each tag read once, whatever the number of rounds (the view does not change during a pass). */
export type TypeReads = {
	query: Core.Query<Config>
	byTag: Map<string, Promise<Scl.TrackedRecord<Scl.ElementsOf>[]>>
}

/** A set of type names per tag of type: the names a round judges, or the ones a referrer names. */
export type NamesByTarget = Map<TypeIdTarget, Set<string>>

/** A type a round judges: the record of the type and the id its referrers name it by. */
export type TypeCandidate = {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	typeId: string
}
