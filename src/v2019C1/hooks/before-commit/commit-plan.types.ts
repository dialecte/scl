import type { BoundLNodes } from './bound-logical-nodes.types'
import type { MovePlaces, MovedRef } from './moved-roots.types'
import type { MoveRemoval } from './moves.types'
import type { PrunedContainer } from './prune-emptied-containers.types'
import type { ReleasedLNodeBinding } from './release-deleted-logical-nodes.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The name of a step of the commit. */
export type CommitStepName =
	| 'movedRoots'
	| 'lnodeNamings'
	| 'tupleNames'
	| 'tupleReferences'
	| 'pathReferences'
	| 'moves'
	| 'releasedLNodes'
	| 'uuidReferences'
	| 'emptiedContainers'
	| 'unusedTypes'
	| 'emptiedTypeContainers'
	| 'noChildLeftBehind'

/** What a step adds to the commit's state for the steps after it. */
export type CommitState = {
	/** The LNodes created or rebound and the logical nodes they name, read once by the naming step. */
	bound?: BoundLNodes
	/** The places of the elements the transaction moved, the document read once for them; none without a move. */
	movePlaces?: MovePlaces
	/** The moved elements no other moved element holds: the roots whose paths the commit follows. */
	targetRoots?: readonly MovedRef[]
	/** The containers the prune steps remove, the first pass then the one after the type prune. */
	containers?: readonly PrunedContainer[]
	/** The elements the moves of the commit remove, with why each goes. */
	moveRemovals?: readonly MoveRemoval[]
	/** The LNodes the commit released from a logical node the transaction deleted. */
	released?: readonly ReleasedLNodeBinding[]
}

/** What the commit's steps read as they run, in order: a step may add to `state` what a later step reads. */
export type CommitPlan = {
	readonly operations: ReadonlyArray<Scl.Operation>
	readonly query: Core.Query<Config>
	/** What each step before staged, by its name, in run order. */
	readonly staged: ReadonlyMap<CommitStepName, readonly Scl.Operation[]>
	readonly state: CommitState
}

/** What a step stages, and what it adds to the state. */
export type CommitStepResult = {
	operations: readonly Scl.Operation[]
	state?: CommitState
}

/** The writes of the steps before a step: the record each left (a delete left out), and the ids they deleted. */
export type StepWrites = {
	pending: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	gone: ReadonlySet<string>
}

/** What a step is given: the commit's plan so far, and the writes of the steps before it it reads. */
export type CommitStepParams = { plan: CommitPlan; writes: StepWrites }

/** One step of the commit. */
export type CommitStep = {
	name: CommitStepName
	/** Whether it reads the writes of every step before it; `false` reads the transaction's operations only. */
	readsEarlier: boolean
	run: (params: CommitStepParams) => Promise<CommitStepResult>
}

/**
 * What the commit stages beyond the transaction's own operations, in order, and what it removes beside the edits: the
 * containers its prune removes, the elements its moves remove, and the LNodes it releases.
 */
export type PlannedCommit = {
	staged: Scl.Operation[]
	/** What each step staged, by its name, in run order. */
	stagedBy: ReadonlyMap<CommitStepName, readonly Scl.Operation[]>
	containers: PrunedContainer[]
	moveRemovals: MoveRemoval[]
	released: ReleasedLNodeBinding[]
}
