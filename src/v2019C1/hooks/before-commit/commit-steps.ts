import { readBoundLNodes } from './bound-logical-nodes'
import { findLeftChildren } from './left-children'
import { LEFT_CHILDREN_PERF_SPAN } from './left-children.constants'
import { readMovePlaces, topmostMovedRoots } from './moved-roots'
import { movedTargetNameOperations } from './moved-within-an-ied'
import { assertMovesFollowed, followMovesAtCommit } from './moves'
import { writePathReferencesAtCommit } from './path-references'
import { pruneEmptiedContainers } from './prune-emptied-containers'
import { pruneUnusedTypes } from './prune-unused-types'
import {
	releaseLNodesOfDeletedLogicalNodes,
	releasedLNodeBindings,
} from './release-deleted-logical-nodes'
import { specificationIedsOfCreated } from './specification-ieds-of-created'
import { writeTupleNamesAtCommit } from './tuple-names'
import { writeTupleReferencesAtCommit } from './tuple-references'
import { checkUuidReferencesAtCommit } from './uuid-references'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { readAttribute } from '@/v2019C1/helpers'
import { ensureLNodeSpecNaming, hasAttributeChange } from '@/v2019C1/hooks/shared'

import type { CommitStepParams, CommitStepResult } from './commit-plan.types'
import type { LeftChild } from './left-children.types'
import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The elements the transaction moved ({@link readMovePlaces}): the document read once when there is one, a moved subtree
 * holding what a move does not follow refused first ({@link assertMovesFollowed}), and the roots whose paths the commit
 * follows kept in the state with the places read. Stages nothing; reads nothing without a move.
 */
export async function movedRoots({ plan }: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query } = plan
	const movePlaces = await readMovePlaces({ operations, query })
	if (!movePlaces) return { operations: [] }
	assertMovesFollowed(movePlaces)
	return { operations: [], state: { movePlaces, targetRoots: topmostMovedRoots(movePlaces) } }
}

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
 * rebound, those of the logical node its `lnUuid` names ({@link writeTupleNamesAtCommit}); then those naming a target
 * moved within its IED, at its new place ({@link movedTargetNameOperations}).
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
	if (!state.movePlaces) return { operations: written }
	// the targets moved within their IED, named from the document the move step read (nothing read again), over what
	// the writes above left: one update per reference, the last holding every name written
	const moved = movedTargetNameOperations({
		places: state.movePlaces,
		pending: withWritten({ pending: writes.pending, operations: written }),
	})
	return { operations: oneUpdatePerRecord({ operations: [...written, ...moved] }) }
}

/** The tuple references' uuid and names in agreement ({@link writeTupleReferencesAtCommit}). */
export async function tupleReferences({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query, state } = plan
	return {
		operations: await writeTupleReferencesAtCommit({
			operations,
			query,
			pending: writes.pending,
			// the document a move step read: the elements above the targets a move touched are not read again
			held: state.movePlaces?.read,
		}),
	}
}

/**
 * The path references left without a uuid or with a path their update could not resolve
 * ({@link writePathReferencesAtCommit}); a moved root counts as created, and the document the move step read is not read
 * again.
 */
export async function pathReferences({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query, state } = plan
	return {
		operations: await writePathReferencesAtCommit({
			operations,
			query,
			pending: writes.pending,
			targetRoots: new Set((state.targetRoots ?? []).map((root) => root.id)),
			document: state.movePlaces?.document,
		}),
	}
}

/**
 * What the transaction's moves change around them, over what every step before wrote ({@link followMovesAtCommit});
 * nothing without a move. What they remove on the way - a reference their new place cannot reach, a terminal left
 * naming a node its container may not name, and what goes with either - is kept in the state, so the commit's preview
 * lists it.
 */
export async function moves({ plan, writes }: CommitStepParams): Promise<CommitStepResult> {
	const { query, state } = plan
	if (!state.movePlaces) return { operations: [] }
	const followed = await followMovesAtCommit(query, {
		places: state.movePlaces,
		roots: state.targetRoots ?? [],
		pending: writes.pending,
	})
	return { operations: followed.operations, state: { moveRemovals: followed.removals } }
}

/**
 * The LNodes bound to a logical node the transaction deleted, released ({@link releaseLNodesOfDeletedLogicalNodes}).
 * The binding each had and the one it is left with are kept in the state ({@link releasedLNodeBindings}), so the
 * commit's preview says which LNodes it unbound.
 */
export async function releasedLNodes({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query } = plan
	const released = await releaseLNodesOfDeletedLogicalNodes(query, {
		operations,
		pending: writes.pending,
	})
	return {
		operations: released,
		state: { released: releasedLNodeBindings({ operations: released }) },
	}
}

/**
 * Refuse the commit when a uuid reference the transaction writes cannot be named coherently
 * ({@link checkUuidReferencesAtCommit}), over what the steps before it left; stages the paths it writes for the variables a move put in reach.
 */
export async function uuidReferences({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query } = plan
	return {
		operations: await checkUuidReferencesAtCommit({
			operations,
			query,
			pending: writes.pending,
			gone: writes.gone,
		}),
	}
}

/**
 * The types no referrer names any more, with what only they named ({@link pruneUnusedTypes}). The names are judged over
 * the transaction's operations and over everything the steps before staged, so a type a cascade of the commit itself
 * stopped naming goes too; what those steps deleted does not count as a referrer, and what they wrote is read instead
 * of the staged state.
 */
export async function unusedTypes({ plan, writes }: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query, staged } = plan
	return {
		operations: await pruneUnusedTypes({
			operations: [...operations, ...[...staged.values()].flat()],
			query,
			pending: writes.pending,
			gone: writes.gone,
		}),
	}
}

/**
 * The containers the transaction left holding nothing, judged with what every step before wrote
 * ({@link pruneEmptiedContainers}): each kept in the state with why it goes.
 */
export async function emptiedContainers({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query } = plan
	const pruned = await pruneEmptiedContainers({
		operations,
		query,
		pending: writes.pending,
		gone: writes.gone,
	})
	return { operations: pruned.operations, state: { containers: pruned.containers } }
}

/**
 * The containers the type prune left holding nothing - a `DataTypeTemplates` holding only the types it removed - judged
 * over the transaction's operations and that step's ({@link pruneEmptiedContainers}). One the first pass pruned is gone
 * already and is neither pruned nor reported twice; the containers it removes are added to the ones the first pass kept
 * in the state. Reads nothing when the type prune removed no type: the first pass judged every candidate already.
 */
export async function emptiedTypeContainers({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const { operations, query, staged, state } = plan
	const typePrune = staged.get('unusedTypes') ?? []
	if (typePrune.length === 0) return { operations: [] }
	const pruned = await pruneEmptiedContainers({
		operations: [...operations, ...typePrune],
		query,
		pending: writes.pending,
		gone: writes.gone,
	})
	return {
		operations: pruned.operations,
		state: { containers: [...(state.containers ?? []), ...pruned.containers] },
	}
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

/** The records the commit's earlier steps left, with the updates of some operations over them. */
function withWritten(params: {
	pending: ReadonlyMap<string, AnyRawRecord>
	operations: readonly Scl.Operation[]
}): Map<string, AnyRawRecord> {
	const merged = new Map(params.pending)
	for (const operation of params.operations) {
		if (operation.status === 'updated')
			merged.set(operation.newRecord.id, operation.newRecord as AnyRawRecord)
	}
	return merged
}

/** The updates of the operations folded to one per record: the first state it was read in, the last it is left in. */
function oneUpdatePerRecord(params: { operations: readonly Scl.Operation[] }): Scl.Operation[] {
	const byId = new Map<string, Scl.Operation>()
	const others: Scl.Operation[] = []
	for (const operation of params.operations) {
		if (operation.status !== 'updated') {
			others.push(operation)
			continue
		}
		const known = byId.get(operation.newRecord.id)
		byId.set(
			operation.newRecord.id,
			known?.status === 'updated' ? { ...operation, oldRecord: known.oldRecord } : operation,
		)
	}
	return [...others, ...byId.values()]
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
