import { isPrunedWhenEmpty } from '@/v2019C1/helpers/pruned-when-empty'
import { PRUNED_WHEN_EMPTY_TAGS } from '@/v2019C1/helpers/pruned-when-empty.constants'
import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'
import {
	buildCascadeOperations,
	collectDeleteCascade,
	collectEmptiedAbove,
	holdsNothingBut,
} from '@/v2019C1/hooks/before-delete'

import type { PruneCandidate } from './prune-emptied-containers.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The containers the transaction left holding nothing — no child, no text — that have no reason to stay then
 * (`isPrunedWhenEmpty`: a wrapper of the dialecte's own elements, an element whose definition needs a child element), each walked up,
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
}): Promise<Scl.Operation[]> {
	const { operations, query, pending } = params
	const kept = new Set<string>()
	for (const record of pending.values()) if (record.parent) kept.add(record.parent.id)
	const gone = new Set<string>()
	const roots: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	for (const candidate of emptiedCandidates(operations)) {
		if (gone.has(candidate.id) || kept.has(candidate.id)) continue
		const record = await query.getRecord(candidate)
		if (!record || !isPrunedWhenEmpty(record) || !holdsNothingBut({ record, gone })) continue
		gone.add(record.id)
		roots.push(record)
		roots.push(...(await collectEmptiedAbove(query, { record, gone, kept })))
	}
	if (roots.length === 0) return []
	const cascade = await collectDeleteCascade(query, { roots, emptiesContainers: true, kept })
	return buildCascadeOperations(query, { cascade, deletedRoots: roots, pending })
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
