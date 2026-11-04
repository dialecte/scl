import { CASCADE_PERF_SPAN } from './orphaned-refs.constants'

import { toRawRecord, widen } from '@dialecte/core/helpers'

import { KEEP_ON_ORPHAN_REFS, REFERENCE_TAGS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'
import { isPrunedWhenEmpty } from '@/v2019C1/helpers/pruned-when-empty'
import { PRUNED_WHEN_EMPTY_TAGS } from '@/v2019C1/helpers/pruned-when-empty.constants'

import type { DeleteCascade, OrphanedRef, RefPairs } from './orphaned-refs.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

// ── Orphaned refs cleanup ─────────────────────────────────────────────────────

/**
 * Stage what deleting a subtree does to what refers to it ({@link collectDeleteCascade}): a reference keeping its
 * content has its uuid, path and companion attributes cleared; any other is deleted. Each parent losing children is
 * updated once. The record itself is deleted by the caller; a container left holding nothing goes at the commit.
 */
export async function cleanOrphanedRefs<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { record, query } = params
	query.perf.start(CASCADE_PERF_SPAN)
	try {
		// a container a deleted reference empties is judged at the commit: the transaction may fill it again before
		const cascade = await collectDeleteCascade(query, {
			roots: [widen(record)],
			emptiesContainers: false,
		})
		return await buildCascadeOperations(query, { cascade, deletedRoots: [] })
	} finally {
		query.perf.stop(CASCADE_PERF_SPAN)
	}
}

/**
 * What deleting the roots does beyond their subtrees, read only: the references outside naming one of their elements
 * (`findOrphanedRefs`), deleted or cleared; with `emptiesContainers`, the containers a deleted reference leaves holding
 * nothing that have no reason to stay ({@link collectEmptiedAbove}); then what refers to what was deleted, in turn.
 * A deleted reference takes what it holds with it (`within`, read level by level, {@link readSubtreeRecords}); only
 * what a delete takes by itself is in `deleted`. The delete hook stages it, the commit pass stages it for the
 * containers it removes, a report lists it.
 */
export async function collectDeleteCascade(
	query: Core.Query<Config>,
	params: {
		roots: readonly Scl.RawRecord<Scl.ElementsOf>[]
		/** The containers a deleted reference leaves holding nothing go too, with what refers to them. */
		emptiesContainers: boolean
		/** Containers never judged empty (the commit's other operations give them a child). */
		kept?: ReadonlySet<string>
	},
): Promise<DeleteCascade> {
	const { emptiesContainers, kept } = params
	const rootSubtree = await readSubtreeRecords(query, { records: params.roots })
	const gone = new Set(rootSubtree.map((record) => record.id))

	const deleted = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>>()
	const within = new Map<string, Scl.RawRecord<Scl.ElementsOf>>()
	const cleared = new Map<string, OrphanedRef>()
	let roundSubtree: readonly Scl.RawRecord<Scl.ElementsOf>[] = rootSubtree
	while (roundSubtree.length > 0) {
		// what goes in this round is named by references in turn: a relation a deleted equipment took has its own
		const references: Scl.TrackedRecord<Scl.ElementsOf>[] = []
		const containers: Scl.TrackedRecord<Scl.ElementsOf>[] = []
		for (const orphaned of await findOrphanedRefsInSubtrees({ subtree: roundSubtree, query })) {
			const { id } = orphaned.record
			if (gone.has(id)) continue
			if (orphaned.effect === 'cleared') {
				mergeCleared({ cleared, orphaned })
				continue
			}
			gone.add(id)
			deleted.set(id, orphaned.record)
			references.push(orphaned.record)
			if (emptiesContainers) {
				const emptied = await collectEmptiedAbove(query, { record: orphaned.record, gone, kept })
				for (const container of emptied) deleted.set(container.id, container)
				containers.push(...emptied)
			}
		}
		// each deleted reference takes what it holds, so those records go too and are not listed on their own
		const referenceSubtree = await readSubtreeRecords(query, { records: references })
		const insideAnother = recordsInsideAnother(referenceSubtree)
		for (const record of insideAnother) {
			gone.add(record.id)
			within.set(record.id, record)
		}
		roundSubtree = [...referenceSubtree, ...containers]
	}
	for (const id of within.keys()) deleted.delete(id)
	const stillThere = [...cleared.values()].filter((orphaned) => !gone.has(orphaned.record.id))
	return {
		gone,
		deleted: [...deleted.values()],
		within: [...within.values()],
		cleared: stillThere,
	}
}

/**
 * The containers above a record that are left holding nothing once everything in `gone` is gone — no other child,
 * no text — and have no reason to stay then (`isPrunedWhenEmpty`), walked up; each is added to `gone`. One already in
 * `gone` is not walked through.
 */
export async function collectEmptiedAbove(
	query: Core.Query<Config>,
	params: {
		record: Scl.RawRecord<Scl.ElementsOf>
		gone: Set<string>
		/** Containers the walk stops at, whatever they hold. */
		kept?: ReadonlySet<string>
	},
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { gone, kept } = params
	const emptied: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	let parentRef = params.record.parent
	while (parentRef && PRUNED_WHEN_EMPTY_TAGS.has(parentRef.tagName) && !gone.has(parentRef.id)) {
		if (kept?.has(parentRef.id)) break
		const parent: Scl.TrackedRecord<Scl.ElementsOf> | undefined = await query.getRecord(parentRef)
		if (!parent || !isPrunedWhenEmpty(parent) || !holdsNothingBut({ record: parent, gone })) break
		gone.add(parent.id)
		emptied.push(parent)
		parentRef = parent.parent
	}
	return emptied
}

/** Whether a record, not the root, holds no text and no child but those in `gone`. */
export function holdsNothingBut(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	gone: ReadonlySet<string>
}): boolean {
	const { record, gone } = params
	if (!record.parent || record.value.trim() !== '') return false
	return record.children.every((child) => gone.has(child.id))
}

/**
 * The operations of a cascade: each reference cleared, each record deleted (the roots given in `deletedRoots` too, and
 * what the deleted references hold), and one update per parent that stays and loses children.
 */
export async function buildCascadeOperations(
	query: Core.Query<Config>,
	params: {
		cascade: DeleteCascade
		deletedRoots: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
		/** Records other operations of the same commit write, read instead of the staged state. */
		pending?: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	},
): Promise<Scl.Operation[]> {
	const { cascade, deletedRoots, pending } = params
	const operations: Scl.Operation[] = []
	for (const orphaned of cascade.cleared) {
		operations.push(buildClearedAttributesOp(orphaned.record, orphaned.attributes))
	}
	const deleted = [...deletedRoots, ...cascade.deleted]
	for (const deletedRecord of [...deleted, ...cascade.within]) {
		operations.push({
			status: 'deleted',
			oldRecord: toRawRecord(deletedRecord),
			newRecord: undefined,
		})
	}
	const parentUpdates = await buildParentUpdates(query, { deleted, gone: cascade.gone, pending })
	operations.push(...parentUpdates)
	return operations
}

/** The record ids of the subtrees of `records`, their wrappers included. */
export async function collectSubtreeIds(
	query: Core.Query<Config>,
	params: { records: readonly Scl.RawRecord<Scl.ElementsOf>[] },
): Promise<Set<string>> {
	const subtree = await readSubtreeRecords(query, { records: params.records })
	return new Set(subtree.map((record) => record.id))
}

/**
 * Every record of the subtrees of `records`, the roots first then level by level: it follows `children` whatever the
 * tag (a foreign element, a `Private`'s content), reading one level in one batched `query.getRecords`. A record with
 * no child costs no read; a child id that is no record is skipped; a record reached twice is returned once.
 */
export async function readSubtreeRecords(
	query: Core.Query<Config>,
	params: { records: readonly Scl.RawRecord<Scl.ElementsOf>[] },
): Promise<Scl.RawRecord<Scl.ElementsOf>[]> {
	const seen = new Set<string>()
	const subtree: Scl.RawRecord<Scl.ElementsOf>[] = []
	let level: Scl.RawRecord<Scl.ElementsOf>[] = []
	for (const record of params.records) {
		if (seen.has(record.id)) continue
		seen.add(record.id)
		level.push(record)
	}
	while (level.length > 0) {
		subtree.push(...level)
		const childRefs: Scl.Ref<Scl.ElementsOf>[] = []
		for (const record of level) {
			for (const childRef of record.children) {
				if (seen.has(childRef.id)) continue
				seen.add(childRef.id)
				childRefs.push(childRef as Scl.Ref<Scl.ElementsOf>)
			}
		}
		if (childRefs.length === 0) break
		const children = await query.getRecords<Scl.ElementsOf>(childRefs)
		level = children.filter((child) => child !== undefined)
	}
	return subtree
}

/**
 * The records of some read subtrees that sit inside another record of them: their parent is in the subtrees too, so
 * the roots left out, except one that lies inside another root.
 */
function recordsInsideAnother(
	subtree: readonly Scl.RawRecord<Scl.ElementsOf>[],
): Scl.RawRecord<Scl.ElementsOf>[] {
	const ids = new Set(subtree.map((record) => record.id))
	return subtree.filter((record) => record.parent !== null && ids.has(record.parent.id))
}

/** Record a reference cleared, the attributes of each removal naming it together. */
function mergeCleared(params: { cleared: Map<string, OrphanedRef>; orphaned: OrphanedRef }): void {
	const { cleared, orphaned } = params
	const known = cleared.get(orphaned.record.id)
	const attributes = new Set([...(known?.attributes ?? []), ...orphaned.attributes])
	cleared.set(orphaned.record.id, { ...orphaned, attributes })
}

/** One update per parent that stays and loses children: its children list without them. */
async function buildParentUpdates(
	query: Core.Query<Config>,
	params: {
		deleted: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
		gone: ReadonlySet<string>
		pending?: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	},
): Promise<Scl.Operation[]> {
	const { deleted, gone, pending } = params
	const parentIds = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const deletedRecord of deleted) {
		const { parent } = deletedRecord
		if (parent && !gone.has(parent.id)) parentIds.set(parent.id, parent as Scl.Ref<Scl.ElementsOf>)
	}
	const operations: Scl.Operation[] = []
	for (const [parentId, parentRef] of parentIds) {
		const parentRecord = pending?.get(parentId) ?? (await query.getRecord(parentRef))
		if (!parentRecord) continue
		const children = parentRecord.children.filter((child) => !gone.has(child.id))
		operations.push({
			status: 'updated',
			oldRecord: toRawRecord(parentRecord),
			newRecord: toRawRecord({ ...parentRecord, children }),
		})
	}
	return operations
}

/**
 * The references outside some subtrees that name an element of them, each with what their deletion does to them:
 * `cleared` for a reference keeping its content (`KEEP_ON_ORPHAN_REFS`: its uuid, path and companion attributes go),
 * `deleted` for any other. A reference inside the subtrees goes with them. The reference tags are read once.
 */
export async function findOrphanedRefs(params: {
	records: readonly Scl.RawRecord<Scl.ElementsOf>[]
	query: Core.Query<Config>
}): Promise<OrphanedRef[]> {
	const { records, query } = params
	const subtree = await readSubtreeRecords(query, { records })
	return findOrphanedRefsInSubtrees({ subtree, query })
}

/** {@link findOrphanedRefs} over subtrees already read. */
async function findOrphanedRefsInSubtrees(params: {
	subtree: readonly Scl.RawRecord<Scl.ElementsOf>[]
	query: Core.Query<Config>
}): Promise<OrphanedRef[]> {
	const { subtree, query } = params

	const subtreeIds = new Set<string>()
	const subtreeUuids = new Set<string>()
	for (const record of subtree) {
		subtreeIds.add(record.id)
		const uuid = readAttribute({ record, name: 'uuid' })
		if (uuid) subtreeUuids.add(uuid)
	}
	if (subtreeUuids.size === 0) return []

	const orphaned: OrphanedRef[] = []
	for (const refTagName of REFERENCE_TAGS) {
		const refPairs = UUID_REFERENCE_PAIRS[refTagName]
		for (const refRecord of await query.getRecordsByTagName(refTagName)) {
			if (subtreeIds.has(refRecord.id)) continue
			const attributes = collectOrphanedAttrs({ refPairs, refRecord, subtreeUuids })
			if (attributes.size === 0) continue
			const effect = KEEP_ON_ORPHAN_REFS.has(refTagName) ? 'cleared' : 'deleted'
			orphaned.push({ record: refRecord, effect, attributes })
		}
	}
	return orphaned
}

// ── Attribute collection ──────────────────────────────────────────────────────

function collectOrphanedAttrs(params: {
	refPairs: RefPairs
	refRecord: Scl.TrackedRecord<Scl.ElementsOf>
	subtreeUuids: Set<string>
}): Set<string> {
	const { refPairs, refRecord, subtreeUuids } = params
	const attrsToClear = new Set<string>()

	for (const pair of refPairs) {
		const uuidValue = readAttribute({
			record: refRecord,
			name: pair.attribute.uuid,
			defaults: 'none',
		})
		if (!uuidValue || !subtreeUuids.has(uuidValue)) continue

		attrsToClear.add(pair.attribute.uuid)
		attrsToClear.add(pair.attribute.path)
		for (const companion of pair.companions) {
			attrsToClear.add(companion.name)
		}
	}

	return attrsToClear
}

// ── Operation builders ────────────────────────────────────────────────────────

function buildClearedAttributesOp(
	refRecord: Scl.TrackedRecord<Scl.ElementsOf>,
	attributesToClear: ReadonlySet<string>,
): Scl.Operation {
	const updatedAttributes = refRecord.attributes.filter(
		(attribute) => !attributesToClear.has(attribute.name),
	)
	return {
		status: 'updated',
		oldRecord: toRawRecord(refRecord),
		newRecord: toRawRecord({ ...refRecord, attributes: updatedAttributes }),
	}
}
