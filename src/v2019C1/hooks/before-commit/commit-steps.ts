import { readBoundLNodes } from './bound-logical-nodes'
import { findLeftChildren } from './left-children'
import { LEFT_CHILDREN_PERF_SPAN } from './left-children.constants'
import { writePathReferencesAtCommit } from './path-references'
import { pruneEmptiedContainers } from './prune-emptied-containers'
import { pruneUnusedTypes } from './prune-unused-types'
import { releaseLNodesOfDeletedLogicalNodes } from './release-deleted-logical-nodes'
import { specificationIedsOfCreated } from './specification-ieds-of-created'
import { writeTupleNamesAtCommit } from './tuple-names'
import { writeTupleReferencesAtCommit } from './tuple-references'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { readAttribute } from '@/v2019C1/helpers'
import { ensureLNodeSpecNaming, hasAttributeChange } from '@/v2019C1/hooks/shared'

import type { CommitStepParams, CommitStepResult } from './commit-plan.types'
import type { LeftChild } from './left-children.types'
import type { Scl } from '@/v2019C1/config'

/**
 * Every LNode the transaction created and still holds carries an `LNodeSpecNaming`: one brought by a copy or added by
 * the caller is kept, the others get one from the LNode's own naming; an LNode the transaction created or bound to a
 * logical node of a specification IED is specified on it, its naming names that IED and logical device whatever the
 * naming it was created with (a template's placeholder). The LNodes created or rebound and the logical nodes their
 * `lnUuid` name are read once ({@link readBoundLNodes}) and kept in the state for their names. Run at the commit, not
 * on create: when an LNode is created, its children (a copied `LNodeSpecNaming` among them) are not added yet.
 */
export async function lnodeNamings({ plan }: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query } = plan
	const created = new Set<string>()
	const rebound = new Set<string>()
	for (const operation of operations) {
		if (operation.status === 'created' && operation.newRecord.tagName === 'LNode') {
			created.add(operation.newRecord.id)
		}
		if (isRebinding(operation)) rebound.add(operation.newRecord.id)
	}
	const bound = await readBoundLNodes({ query, lnodeIds: new Set([...created, ...rebound]) })
	const specifiedLNodes = await specificationIedsOfCreated({ query, bound })
	const ensured: Scl.Operation[] = []
	for (const id of new Set([...created, ...specifiedLNodes.keys()])) {
		const specified = specifiedLNodes.get(id)
		const naming = await ensureLNodeSpecNaming(query, {
			lnode: { tagName: 'LNode', id },
			specificationIed: specified?.specificationIed,
			namingAttributes: specified?.namingAttributes,
		})
		ensured.push(...naming)
	}
	return { operations: ensured, state: { bound } }
}

/**
 * The names of the tuple references naming a target the transaction created by its uuid, and of each LNode created or
 * rebound, those of the logical node its `lnUuid` names ({@link writeTupleNamesAtCommit}).
 */
export async function tupleNames({ plan, writes }: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query, state } = plan
	if (!state.bound) {
		return throwDialecteError('ASSERTION_FAILED', {
			detail: 'tupleNames: the LNodes bound are read by lnodeNamings, which runs first',
		})
	}
	const written = await writeTupleNamesAtCommit({
		operations,
		query,
		bound: state.bound,
		pending: writes.pending,
	})
	return { operations: written }
}

/** The tuple references' uuid and names in agreement ({@link writeTupleReferencesAtCommit}). */
export async function tupleReferences({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query } = plan
	return {
		operations: await writeTupleReferencesAtCommit({ operations, query, pending: writes.pending }),
	}
}

/**
 * The path references left without a uuid or with a path their update could not resolve
 * ({@link writePathReferencesAtCommit}).
 */
export async function pathReferences({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query } = plan
	return {
		operations: await writePathReferencesAtCommit({ operations, query, pending: writes.pending }),
	}
}

/** The LNodes bound to a logical node the transaction deleted, released ({@link releaseLNodesOfDeletedLogicalNodes}). */
export async function releasedLNodes({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query } = plan
	return {
		operations: await releaseLNodesOfDeletedLogicalNodes(query, {
			operations,
			pending: writes.pending,
		}),
	}
}

/** The types no referrer names any more, with what only they named ({@link pruneUnusedTypes}). */
export async function unusedTypes({ plan }: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query } = plan
	return { operations: await pruneUnusedTypes({ operations, query }) }
}

/**
 * The containers the transaction left holding nothing, judged with what every step before wrote, a type the type prune
 * removed among what is gone ({@link pruneEmptiedContainers}): each kept in the state with why it goes.
 */
export async function emptiedContainers({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query, staged } = plan
	const pruned = await pruneEmptiedContainers({
		operations: [...operations, ...(staged.get('unusedTypes') ?? [])],
		query,
		pending: writes.pending,
		gone: writes.gone,
	})
	return { operations: pruned.operations, state: { containers: pruned.containers } }
}

/**
 * Refuse the commit when its operations and the ones staged before delete a record and leave one of its children in
 * the store ({@link findLeftChildren}); stages nothing.
 */
export async function noChildLeftBehind({ plan }: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query, staged } = plan
	const all = [...operations, ...[...staged.values()].flat()]
	query.perf.start(LEFT_CHILDREN_PERF_SPAN)
	let left: LeftChild[]
	try {
		left = await findLeftChildren({ operations: all, query })
	} finally {
		query.perf.stop(LEFT_CHILDREN_PERF_SPAN)
	}
	const [first] = left
	if (!first) return { operations: [] }
	return throwDialecteError(SCL_ERRORS.CHILD_LEFT_BEHIND, {
		meta: { record: first.record, child: first.child },
		detail: `the commit deletes ${first.record.tagName} "${first.record.id}" and leaves its child ${first.child.tagName} "${first.child.id}" in the store`,
	})
}

/** Whether an operation binds an LNode the transaction did not create to a logical node (its `lnUuid` set, changed). */
function isRebinding(
	operation: Scl.Operation,
): operation is Extract<Scl.Operation, { status: 'updated' }> {
	if (operation.status !== 'updated' || operation.newRecord.tagName !== 'LNode') return false
	const lnUuid = readAttribute({
		record: operation.newRecord,
		name: 'lnUuid',
		defaults: 'none',
		fullObject: true,
	})?.value
	return Boolean(lnUuid) && hasAttributeChange({ ...operation, names: ['lnUuid'] })
}
