import type { IdentifiedRef, LeftChild } from './left-children.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The children a commit would leave behind: a record the operations delete (its last operation is `deleted`) with a
 * child that is not deleted and does not sit under another parent after the operations. A child with no operation is
 * read in one batched `query.getRecords`, and only the ones that exist count; a commit deleting nothing reads nothing.
 */
export async function findLeftChildren(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<LeftChild[]> {
	const { operations, query } = params
	const lastOperations = lastOperationById(operations)
	const deletedIds = new Set<string>()
	for (const [id, operation] of lastOperations) {
		if (operation.status === 'deleted') deletedIds.add(id)
	}
	if (deletedIds.size === 0) return []

	// the children a deleted record ever listed, whatever the operation that listed them: a child created or moved
	// under it during the transaction is on a record the merge of the log does not keep
	const candidates = new Map<
		string,
		{ record: IdentifiedRef; children: Map<string, IdentifiedRef> }
	>()
	for (const operation of operations) {
		const record = recordOf(operation)
		if (!deletedIds.has(record.id)) continue
		const candidate = candidates.get(record.id) ?? { record: toRef(record), children: new Map() }
		candidates.set(record.id, candidate)
		for (const stored of [operation.oldRecord, operation.newRecord]) {
			for (const childRef of stored?.children ?? []) {
				if (!childRef.id) continue
				if (candidate.children.has(childRef.id)) continue
				candidate.children.set(childRef.id, toRef({ tagName: childRef.tagName, id: childRef.id }))
			}
		}
	}

	const left: LeftChild[] = []
	const suspects: LeftChild[] = []
	for (const { record, children } of candidates.values()) {
		for (const child of children.values()) {
			const lastOperation = lastOperations.get(child.id)
			if (!lastOperation) suspects.push({ record, child })
			else if (staysUnder({ operation: lastOperation, parentId: record.id })) {
				left.push({ record, child })
			}
		}
	}
	if (suspects.length === 0) return left
	const stored = await query.getRecords<Scl.ElementsOf>(suspects.map((suspect) => suspect.child))
	suspects.forEach((suspect, index) => {
		if (stored[index]) left.push(suspect)
	})
	return left
}

/** The last operation written for each record id, in the order the operations are given. */
function lastOperationById(operations: ReadonlyArray<Scl.Operation>): Map<string, Scl.Operation> {
	const lastOperations = new Map<string, Scl.Operation>()
	for (const operation of operations) lastOperations.set(recordOf(operation).id, operation)
	return lastOperations
}

/** Whether, after the operation, the record is still a child of the parent: it is not deleted and has no other parent. */
function staysUnder(params: { operation: Scl.Operation; parentId: string }): boolean {
	const { operation, parentId } = params
	return operation.status !== 'deleted' && operation.newRecord.parent?.id === parentId
}

function recordOf(operation: Scl.Operation): Scl.RawRecord<Scl.ElementsOf> {
	return operation.status === 'deleted' ? operation.oldRecord : operation.newRecord
}

function toRef(ref: { tagName: string; id: string }): IdentifiedRef {
	return { tagName: ref.tagName, id: ref.id } as IdentifiedRef
}
