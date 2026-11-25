import type { BoundLNodes } from './bound-logical-nodes.types'
import type { MovePlaces, MovedRef } from './moved-roots.types'
import type { MoveRemoval } from './moves.types'
import type { PrunedContainer } from './prune-emptied-containers.types'
import type { ReleasedLNodeBinding } from './release-deleted-logical-nodes.types'
import type { UuidReferenceRefusalReason } from './uuid-references.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { SCL_ERRORS } from '@/v2019C1/errors'
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
	/**
	 * Whether a step lists the moves the commit does not follow and the incoherent uuid references in its `refusals` and
	 * goes on, instead of throwing the first.
	 */
	readonly collect: boolean
}

/** What a step stages, and what it adds to the state. */
export type CommitStepResult = {
	operations: readonly Scl.Operation[]
	state?: CommitState
	/** What the step refuses, listed in collect mode (`CommitPlan.collect`). */
	refusals?: readonly CommitRefusal[]
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
	/** Every refusal the steps listed in collect mode, in run order; empty otherwise. */
	refusals: CommitRefusal[]
	/** The records the transaction's moves carry, each moved element included, from the move step's one read. */
	carried: number
}

/** An element a refusal of the commit names: its tag and record id. */
export type CommitRefusalElement = { tagName: string; id: string }

/**
 * A refusal of the commit as data, with the key, code, meta and detail the commit throws it with: a move it does not
 * follow (`MOVE_NOT_FOLLOWED`, SCL4003), or a uuid reference the transaction writes that cannot be named coherently
 * (`REFERENCE_INCOHERENT`, SCL4004). Only these two are collected; every other refusal of the commit still throws.
 */
export type CommitRefusal =
	| {
			key: 'MOVE_NOT_FOLLOWED'
			code: (typeof SCL_ERRORS)['MOVE_NOT_FOLLOWED']['code']
			meta: { moved: CommitRefusalElement; parent: CommitRefusalElement }
			detail: string
	  }
	| {
			key: 'REFERENCE_INCOHERENT'
			code: (typeof SCL_ERRORS)['REFERENCE_INCOHERENT']['code']
			meta: {
				reference: CommitRefusalElement
				uuidAttribute: string
				reason: UuidReferenceRefusalReason
			}
			detail: string
	  }
