import type { DecisionGroup, DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { AnyTreeRecord } from '@dialecte/core'

/** A source descendant of an added subtree that pairs with an instance element elsewhere: it moves, it is not added. */
export type MovedInAdded = {
	source: AnyTreeRecord
	instance: AnyTreeRecord
	/** The source parent it lands under: added too, so it is named by its source ref. */
	sourceParent: AnyTreeRecord
}

/** The groups of one diff, and the instance tree the moves start from. */
export type LinkMovesParams = {
	groups: readonly DecisionGroup[]
	instanceTree: AnyTreeRecord
}

/** A moved node put in place of an added one in an added subtree. */
export type ReplaceAddedParams = {
	node: DiffNode
	sourceId: string
	moved: DiffNode
}

/** An accepted move the reconcile writes once its walk is done: the instance element, and the parent it moves under. */
export type PendingMove = {
	instance: AnyTreeRecord
	parent: Scl.Ref<Scl.ElementsOf>
}

/** Where to look for moved descendants: an added source subtree, and the instance index by the source's uuid. */
export type FindMovedInAddedParams = {
	node: AnyTreeRecord
	index: ReadonlyMap<string, AnyTreeRecord>
	/** The boundary tags another pass owns: not walked into. */
	omit?: readonly string[]
	/** The source elements the instance's selection of variants leaves out: not walked into. */
	notSelected?: ReadonlySet<string>
}

/** An instance element below a removed one, the key the update pairs by, and the lineages the source holds. */
export type MovedOutParams = {
	node: AnyTreeRecord
	matchKey: MatchKey
	sourceUuids: ReadonlySet<string>
}

/** A diff's tree, and the instance tree it was read against (the walk's view, through transparent wrappers). */
export type TreeParentsParams = { root: DiffNode; instanceTree: AnyTreeRecord }

/** The accepted moves of a reconcile, written once its walk is done. */
export type WriteMovesParams = { moves: readonly PendingMove[] }
