import { NO_WRITES } from './before-commit.constants'
import { COMMIT_STEPS } from './commit-steps.constants'

import type {
	CommitPlan,
	CommitState,
	CommitStepName,
	PlannedCommit,
	StepWrites,
} from './commit-plan.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Once the transaction's work is done, the commit's steps run ({@link planCommit}): every LNode it created and still
 * holds carries an `LNodeSpecNaming`: one brought by a copy or added by the caller is kept, the others get one from
 * the LNode's own naming; an LNode the transaction created or bound to a logical node of a
 * specification IED is specified on it, its naming names that IED and logical device whatever
 * the naming it was created with (a template's placeholder). The LNodes created or rebound and the logical nodes
 * their `lnUuid` name are read once ({@link readBoundLNodes}), for this and for their names.
 * Run here, not on create: when an LNode is created, its children (a copied
 * `LNodeSpecNaming` among them) are not added yet. Then the tuple references naming a target the transaction
 * created by its uuid are written its names, once for all the targets, and so is each LNode created or rebound, the
 * names of the logical node its `lnUuid` names ({@link writeTupleNamesAtCommit}). Then the LNodes bound to a logical
 * node the transaction deleted are released ({@link releaseLNodesOfDeletedLogicalNodes}).
 * Then the types the transaction left unused go, with every record of
 * them ({@link pruneUnusedTypes}), then the containers it left holding nothing ({@link pruneEmptiedContainers}: a
 * `DataTypeTemplates` the prune emptied among them), whatever wrote: a delete, an apply, an extract. Last, over the
 * transaction's operations and the ones staged here, a record deleted with a child left in the store refuses the
 * commit ({@link findLeftChildren}).
 */
export async function beforeCommit(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { staged } = await planCommit(params)
	return staged
}

/**
 * The commit's steps ({@link COMMIT_STEPS}) run in order over the transaction's operations, each given what every step
 * before it wrote when it reads them, and adding to the state what a later step reads: what they stage, in order, and
 * the containers the prune removes. Writes nothing itself.
 */
export async function planCommit(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<PlannedCommit> {
	const { operations, query } = params
	const staged = new Map<CommitStepName, readonly Scl.Operation[]>()
	let state: CommitState = {}
	for (const step of COMMIT_STEPS) {
		const plan: CommitPlan = { operations, query, staged, state }
		const writes = step.readsEarlier ? writesOf({ staged }) : NO_WRITES
		const result = await step.run({ plan, writes })
		staged.set(step.name, result.operations)
		state = { ...state, ...result.state }
	}
	return { staged: [...staged.values()].flat(), containers: [...(state.containers ?? [])] }
}

/** What the steps run so far wrote: the record each left, by id, the last one written winning, and the ids deleted. */
function writesOf(params: {
	staged: ReadonlyMap<CommitStepName, readonly Scl.Operation[]>
}): StepWrites {
	const pending = new Map<string, Scl.RawRecord<Scl.ElementsOf>>()
	const gone = new Set<string>()
	for (const operation of [...params.staged.values()].flat()) {
		if (operation.status === 'deleted') gone.add(operation.oldRecord.id)
		else pending.set(operation.newRecord.id, operation.newRecord)
	}
	return { pending, gone }
}
