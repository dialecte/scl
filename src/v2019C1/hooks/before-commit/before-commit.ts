import { findLeftChildren } from './left-children'
import { LEFT_CHILDREN_PERF_SPAN } from './left-children.constants'
import { pruneEmptiedContainers } from './prune-emptied-containers'
import { pruneUnusedTypes } from './prune-unused-types'
import { writeTupleNamesOfCreatedTargets } from './tuple-names'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { ensureLNodeSpecNaming } from '@/v2019C1/hooks/shared'

import type { LeftChild } from './left-children.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Once the transaction's work is done, every LNode it created and still holds carries an
 * `LNodeSpecNaming`: one brought by a copy or added by the caller is kept, the others get one from
 * the LNode's own naming. Run here, not on create: when an LNode is created, its children (a copied
 * `LNodeSpecNaming` among them) are not added yet. Then the tuple references naming a target the transaction
 * created by its uuid are written its names, once for all the targets ({@link writeTupleNamesOfCreatedTargets}).
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
	for (const operation of operations) {
		if (operation.status === 'created' && operation.newRecord.tagName === 'LNode') {
			created.add(operation.newRecord.id)
		}
	}

	const ensured: Scl.Operation[] = []
	for (const id of created) {
		const naming = await ensureLNodeSpecNaming(query, { lnode: { tagName: 'LNode', id } })
		ensured.push(...naming)
	}
	// the references naming what the transaction created by uuid write its names
	const tupleNames = await writeTupleNamesOfCreatedTargets({ operations, query })
	// what no referrer names any more goes, with what only it named
	const unusedTypes = await pruneUnusedTypes({ operations, query })
	// what the transaction left holding nothing goes, read with what the naming and the type prune just wrote
	const pending = new Map<string, Scl.RawRecord<Scl.ElementsOf>>()
	const gone = new Set<string>()
	for (const operation of [...ensured, ...unusedTypes]) {
		if (operation.status === 'deleted') gone.add(operation.oldRecord.id)
		else pending.set(operation.newRecord.id, operation.newRecord)
	}
	const pruned = await pruneEmptiedContainers({
		operations: [...operations, ...unusedTypes],
		query,
		pending,
		gone,
	})
	const staged = [...ensured, ...tupleNames, ...unusedTypes, ...pruned]
	await assertNoChildLeftBehind({ operations: [...operations, ...staged], query })
	return staged
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
