import { removedChildrenByParent } from './removed-children'

import { throwDialecteError } from '@dialecte/core'

import { readAttribute } from '@/v2019C1/helpers'
import { emptiedRule } from '@/v2019C1/helpers/pruned-when-empty'
import { PRUNED_WHEN_EMPTY_TAGS } from '@/v2019C1/helpers/pruned-when-empty.constants'
import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'
import {
	buildCascadeOperations,
	collectDeleteCascade,
	collectEmptiedAbove,
	heldByCascadeRoot,
	outsideCascadeRemovals,
	recordsOfCascade,
} from '@/v2019C1/hooks/before-delete'
import { DATA_SET_TAG } from '@/v2019C1/hooks/before-delete/orphaned-refs.constants'
import { DATA_SET_SENDER_TAGS } from '@/v2019C1/hooks/shared/data-set-entry.constants'
import { identityOf } from '@/v2019C1/hooks/shared/element-identity'

import type {
	PruneCandidate,
	PrunedContainer,
	PrunedEmptiedContainers,
	PrunedEffect,
	PruneReason,
} from './prune-emptied-containers.types'
import type { RemovedChildren } from './removed-children.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { DeleteCascade } from '@/v2019C1/hooks/before-delete/orphaned-refs.types'
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
}): Promise<PrunedEmptiedContainers> {
	const { operations, query, pending } = params
	const kept = new Set<string>()
	for (const record of pending.values()) if (record.parent) kept.add(record.parent.id)
	const gone = new Set<string>(params.gone)
	const roots: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	const reasons = new Map<string, PruneReason>()
	const removedByParent = removedChildrenByParent({ operations })
	for (const candidate of emptiedCandidates({ operations, removedByParent })) {
		if (gone.has(candidate.id) || kept.has(candidate.id)) continue
		const record = await query.getRecord(candidate)
		const removed = removedByParent.get(candidate.id)?.children ?? []
		const rule = record ? emptiedRule({ record, gone, removed }) : undefined
		if (!record || !rule) continue
		gone.add(record.id)
		roots.push(record)
		reasons.set(record.id, { kind: 'emptied', ...rule })
		const emptiedAbove = await collectEmptiedAbove(query, { record, gone, kept })
		let below: Scl.TrackedRecord<Scl.ElementsOf> = record
		for (const above of emptiedAbove) {
			reasons.set(above.id, { kind: 'above', below: { tagName: below.tagName, id: below.id } })
			below = above
		}
		roots.push(...emptiedAbove)
	}
	if (roots.length === 0) return { operations: [], containers: [] }
	// what the commit's other operations delete already (the types the type prune removes) is no part of the cascade
	const alreadyGone = new Set(params.gone)
	const read = await collectDeleteCascade(query, { roots, emptiesContainers: true, kept })
	const cascade = {
		...read,
		within: read.within.filter((record) => !alreadyGone.has(record.id)),
		deleted: read.deleted.filter((record) => !alreadyGone.has(record.id)),
	}
	const staged = await buildCascadeOperations(query, {
		cascade,
		deletedRoots: roots,
		pending,
		raised: raisedBlocksOf({ operations }),
	})
	return {
		operations: staged,
		// the ancestry of what goes outside is walked over everything the cascade read, what earlier steps deleted
		// already included: only what this prune reports is taken out of `cascade`
		containers: describeContainers({
			roots,
			reasons,
			cascade,
			staged,
			read: recordsOfCascade({ roots, cascade: read }),
		}),
	}
}

/**
 * Each root pruned, with why, what it still holds and what goes with it outside: a record the cascade takes (`within`, `deleted`) belongs to the
 * nearest root its parents reach, walked in memory over the records the cascade read.
 */
function describeContainers(params: {
	roots: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
	reasons: ReadonlyMap<string, PruneReason>
	cascade: DeleteCascade
	/** The operations the cascade staged: what reaches outside each container. */
	staged: readonly Scl.Operation[]
	/** Every record the cascade read, to walk a cause's ancestry over. */
	read: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
}): PrunedContainer[] {
	const { roots, reasons, cascade, staged, read } = params
	const withinByRoot = heldByCascadeRoot({ roots, cascade, read })
	// what the prune removes beyond the containers themselves goes on the one whose removal caused it
	const outsideByRoot = new Map<string, PrunedEffect[]>()
	for (const { record, effect, rootId, holds } of outsideCascadeRemovals({
		roots,
		cascade,
		read,
	})) {
		// every record the cascade takes names one of the pruned subtrees, and its ancestry is walked over everything
		// the cascade read, so a root is always found: a gap under-reports the preview rather than failing the commit
		if (!rootId) continue
		const outside = outsideByRoot.get(rootId) ?? []
		outside.push({
			element: { tagName: record.tagName, id: record.id },
			identity: identityOf({ record }),
			effect,
			holds,
		})
		outsideByRoot.set(rootId, outside)
	}
	return roots.map(function describeRoot(root): PrunedContainer {
		const { parent } = root
		const reason = reasons.get(root.id)
		if (!parent || !reason) {
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `describeContainers: a pruned ${root.tagName} "${root.id}" without its parent or its reason`,
			})
		}
		return {
			element: { tagName: root.tagName, id: root.id },
			parent: { tagName: parent.tagName, id: parent.id },
			reason,
			within: withinByRoot.get(root.id) ?? [],
			goesWith: withoutRepeats({
				effects: [...(outsideByRoot.get(root.id) ?? []), ...controlBlockEffects({ root, staged })],
			}),
		}
	})
}

/**
 * What a pruned data set does to the control blocks sending it, read from the updates the cascade staged: a block of
 * the same parent whose `datSet` named it is `cleared` when its `datSet` goes, and `revised` when its `confRev` rises.
 * Any other container has none.
 */
function controlBlockEffects(params: {
	root: Scl.RawRecord<Scl.ElementsOf>
	staged: readonly Scl.Operation[]
}): PrunedEffect[] {
	const { root, staged } = params
	if (root.tagName !== DATA_SET_TAG || !root.parent) return []
	const name = readAttribute({ record: root, name: 'name', defaults: 'none' })
	const effects: PrunedEffect[] = []
	for (const operation of staged) {
		if (operation.status !== 'updated') continue
		const { oldRecord, newRecord } = operation
		if (!DATA_SET_SENDER_TAGS.has(oldRecord.tagName) || oldRecord.parent?.id !== root.parent.id)
			continue
		if (readAttribute({ record: oldRecord, name: 'datSet', defaults: 'none' }) !== name) continue
		const element = { tagName: oldRecord.tagName, id: oldRecord.id }
		const identity = identityOf({ record: oldRecord })
		const holds: readonly Scl.RawRecord<Scl.ElementsOf>[] = []
		if (!readAttribute({ record: newRecord, name: 'datSet', defaults: 'none', fullObject: true })) {
			effects.push({ element, identity, effect: 'cleared', holds })
		}
		const before = readAttribute({ record: oldRecord, name: 'confRev', defaults: 'none' })
		const after = readAttribute({ record: newRecord, name: 'confRev', defaults: 'none' })
		if (before !== after) effects.push({ element, identity, effect: 'revised', holds })
	}
	return effects
}

/** Each effect once, the first of a repeated element and effect kept. */
function withoutRepeats(params: { effects: readonly PrunedEffect[] }): PrunedEffect[] {
	const seen = new Set<string>()
	return params.effects.filter(function unseen(effect) {
		const key = `${effect.element.id}|${effect.effect}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
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

/**
 * What an operation may have left holding nothing, each once: the parent of a deleted element, a wrapper created, an
 * element the transaction took children out of (`removedChildrenByParent`, a move's former parent).
 */
function emptiedCandidates(params: {
	operations: ReadonlyArray<Scl.Operation>
	/** The elements the transaction took children out of, a move's former parent among them. */
	removedByParent: ReadonlyMap<string, RemovedChildren>
}): PruneCandidate[] {
	const { operations, removedByParent } = params
	const candidates = new Map<string, PruneCandidate>()
	const found = [
		...operations.map((operation) => emptiedBy(operation)),
		...[...removedByParent.values()].map(({ parent }) => parent as PruneCandidate),
	]
	for (const candidate of found) {
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
