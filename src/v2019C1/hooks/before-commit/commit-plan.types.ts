import type { BoundLNodes } from './bound-logical-nodes.types'
import type { PrunedContainer } from './prune-emptied-containers.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The name of a step of the commit. */
export type CommitStepName =
	| 'lnodeNamings'
	| 'tupleNames'
	| 'tupleReferences'
	| 'pathReferences'
	| 'releasedLNodes'
	| 'unusedTypes'
	| 'emptiedContainers'
	| 'noChildLeftBehind'

/** What a step adds to the commit's state for the steps after it. */
export type CommitState = {
	/** The LNodes created or rebound and the logical nodes they name, read once by the first step. */
	bound?: BoundLNodes
	/** The containers the prune step removes. */
	containers?: readonly PrunedContainer[]
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

/** What the commit stages beyond the transaction's own operations, in order, and the containers its prune removes. */
export type PlannedCommit = {
	staged: Scl.Operation[]
	containers: PrunedContainer[]
}
