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
 * Once the transaction's work is done, what the commit stages beyond it: the steps of {@link COMMIT_STEPS} run in order
 * by {@link planCommit} - a moved subtree holding what a move does not follow refused first, the LNodes' namings, the
 * names and agreement of the references, what the transaction's moves change around them (paths, references out of
 * reach, terminals across substations, wrappers), the LNodes of a deleted logical node released, the unused types and
 * the containers left holding nothing pruned - whatever wrote: a delete, an apply, an extract, a move. A record deleted
 * with a child left in the store refuses the commit.
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
	return {
		staged: [...staged.values()].flat(),
		stagedBy: staged,
		containers: [...(state.containers ?? [])],
	}
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
