import { readAttribute } from '@/v2019C1/helpers'
import { isEmptiedContainer } from '@/v2019C1/helpers/pruned-when-empty'
import { PRUNED_WHEN_EMPTY_TAGS } from '@/v2019C1/helpers/pruned-when-empty.constants'
import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'
import {
	buildCascadeOperations,
	collectDeleteCascade,
	collectEmptiedAbove,
} from '@/v2019C1/hooks/before-delete'

import type { PruneCandidate } from './prune-emptied-containers.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The containers the transaction left emptied (`isEmptiedContainer`: a wrapper of the dialecte's own elements, an element
 * whose definition needs a child element, a `DataSet`, holding nothing else or none of the children of a kind it requires), each walked up,
 * deleted with what refers to them as a delete does ({@link collectDeleteCascade}): the operations staged here do not
 * run the delete hooks. Judged: the parent of every element the transaction deleted, and every wrapper it created (a
 * copy that left out what the wrapper held). An element the transaction deleted since is skipped; so is one that
 * `kept` names (a container the commit's other operations give a child).
 */
export async function pruneEmptiedContainers(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
	/** The records the commit's other operations write: a container they give a child is not judged empty. */
	pending: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	/**
	 * Record ids the commit's other operations delete and `query` still reads (the types the commit prunes): they count
	 * as gone when a container is judged, so a container holding only them is empty.
	 */
	gone?: ReadonlySet<string>
}): Promise<Scl.Operation[]> {
	const { operations, query, pending } = params
	const kept = new Set<string>()
	for (const record of pending.values()) if (record.parent) kept.add(record.parent.id)
	const gone = new Set<string>(params.gone)
	const roots: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	const removedByParent = removedChildrenByParent({ operations })
	for (const candidate of emptiedCandidates(operations)) {
		if (gone.has(candidate.id) || kept.has(candidate.id)) continue
		const record = await query.getRecord(candidate)
		const removed = removedByParent.get(candidate.id) ?? []
		if (!record || !isEmptiedContainer({ record, gone, removed })) continue
		gone.add(record.id)
		roots.push(record)
		const emptiedAbove = await collectEmptiedAbove(query, { record, gone, kept })
		roots.push(...emptiedAbove)
	}
	if (roots.length === 0) return []
	const cascade = await collectDeleteCascade(query, { roots, emptiesContainers: true, kept })
	return buildCascadeOperations(query, {
		cascade,
		deletedRoots: roots,
		pending,
		raised: raisedBlocksOf({ operations }),
	})
}

/** The control blocks whose configuration revision the transaction changed: a data set change raises it once. */
function raisedBlocksOf(params: { operations: ReadonlyArray<Scl.Operation> }): Set<string> {
	return new Set(
		params.operations.flatMap((operation) =>
			operation.status === 'updated' &&
			readAttribute({ record: operation.oldRecord, name: 'confRev', defaults: 'none' }) !==
				readAttribute({ record: operation.newRecord, name: 'confRev', defaults: 'none' })
				? [operation.newRecord.id]
				: [],
		),
	)
}

/** The children the transaction deleted, by the container they left: the staged record no longer lists them. */
function removedChildrenByParent(params: {
	operations: ReadonlyArray<Scl.Operation>
}): Map<string, { tagName: string }[]> {
	const byParent = new Map<string, { tagName: string }[]>()
	for (const operation of params.operations) {
		const parentId = operation.status === 'deleted' ? operation.oldRecord.parent?.id : undefined
		if (operation.status !== 'deleted' || parentId === undefined) continue
		byParent.set(parentId, [
			...(byParent.get(parentId) ?? []),
			{ tagName: operation.oldRecord.tagName },
		])
	}
	return byParent
}

/** What an operation may have left holding nothing: the parent of a deleted element, a wrapper created; each once. */
function emptiedCandidates(operations: ReadonlyArray<Scl.Operation>): PruneCandidate[] {
	const candidates = new Map<string, PruneCandidate>()
	for (const operation of operations) {
		const candidate = emptiedBy(operation)
		if (candidate && PRUNED_WHEN_EMPTY_TAGS.has(candidate.tagName)) {
			candidates.set(candidate.id, candidate)
		}
	}
	return [...candidates.values()]
}

function emptiedBy(operation: Scl.Operation): PruneCandidate | undefined {
	switch (operation.status) {
		case 'deleted': {
			const { parent } = operation.oldRecord
			return parent ? ({ tagName: parent.tagName, id: parent.id } as PruneCandidate) : undefined
		}
		case 'created': {
			const { tagName, id } = operation.newRecord
			if (!isTransparentElement(tagName)) return undefined
			return { tagName, id } as PruneCandidate
		}
		case 'updated':
			return undefined
	}
}
