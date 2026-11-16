import { readBoundLNodes } from './bound-logical-nodes'
import { findLeftChildren } from './left-children'
import { LEFT_CHILDREN_PERF_SPAN } from './left-children.constants'
import { pruneEmptiedContainers } from './prune-emptied-containers'
import { pruneUnusedTypes } from './prune-unused-types'
import { releaseLNodesOfDeletedLogicalNodes } from './release-deleted-logical-nodes'
import { specificationIedsOfCreated } from './specification-ieds-of-created'
import { writeTupleNamesAtCommit } from './tuple-names'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { readAttribute } from '@/v2019C1/helpers'
import { ensureLNodeSpecNaming, hasAttributeChange } from '@/v2019C1/hooks/shared'

import type { LeftChild } from './left-children.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Once the transaction's work is done, every LNode it created and still holds carries an
 * `LNodeSpecNaming`: one brought by a copy or added by the caller is kept, the others get one from
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
	const { operations, query } = params
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
	// the references naming what the transaction created by uuid write its names, the LNodes it bound those of their logical node
	const tupleNames = await writeTupleNamesAtCommit({
		operations,
		query,
		bound,
		pending: lastWrites({ operations: ensured }),
	})
	// the LNodes bound to a logical node the transaction deleted are released, from what the steps above wrote
	const released = await releaseLNodesOfDeletedLogicalNodes(query, {
		operations,
		pending: lastWrites({ operations: [...ensured, ...tupleNames] }),
	})
	// what no referrer names any more goes, with what only it named
	const unusedTypes = await pruneUnusedTypes({ operations, query })
	// what the transaction left holding nothing goes, read with what the naming, the release and the type prune just wrote
	const pending = new Map<string, Scl.RawRecord<Scl.ElementsOf>>()
	const gone = new Set<string>()
	for (const operation of [...ensured, ...released, ...unusedTypes]) {
		if (operation.status === 'deleted') gone.add(operation.oldRecord.id)
		else pending.set(operation.newRecord.id, operation.newRecord)
	}
	const pruned = await pruneEmptiedContainers({
		operations: [...operations, ...unusedTypes],
		query,
		pending,
		gone,
	})
	const staged = [...ensured, ...tupleNames, ...released, ...unusedTypes, ...pruned]
	await assertNoChildLeftBehind({ operations: [...operations, ...staged], query })
	return staged
}

/** The record each operation given leaves, by id, the last one written winning; a deleted one left out. */
function lastWrites(params: { operations: readonly Scl.Operation[] }): Map<string, AnyRawRecord> {
	const written = new Map<string, AnyRawRecord>()
	for (const operation of params.operations) {
		if (operation.status !== 'deleted')
			written.set(operation.newRecord.id, operation.newRecord as AnyRawRecord)
	}
	return written
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

/** Refuse the commit when the operations delete a record and leave one of its children in the store. */
async function assertNoChildLeftBehind(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<void> {
	const { query } = params
	query.perf.start(LEFT_CHILDREN_PERF_SPAN)
	let left: LeftChild[]
	try {
		left = await findLeftChildren(params)
	} finally {
		query.perf.stop(LEFT_CHILDREN_PERF_SPAN)
	}
	const [first] = left
	if (!first) return
	throwDialecteError(SCL_ERRORS.CHILD_LEFT_BEHIND, {
		meta: { record: first.record, child: first.child },
		detail: `the commit deletes ${first.record.tagName} "${first.record.id}" and leaves its child ${first.child.tagName} "${first.child.id}" in the store`,
	})
}
