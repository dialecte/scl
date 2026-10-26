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
	// a container a deleted reference empties is judged at the commit: the transaction may fill it again before
	const cascade = await collectDeleteCascade(query, {
		roots: [widen(record)],
		emptiesContainers: false,
	})
	return buildCascadeOperations(query, { cascade, deletedRoots: [] })
}

/**
 * What deleting the roots does beyond their subtrees, read only: the references outside naming one of their elements
 * (`findOrphanedRefs`), deleted or cleared; with `emptiesContainers`, the containers a deleted reference leaves holding
 * nothing that have no reason to stay ({@link collectEmptiedAbove}); then what refers to what was deleted, in turn. The delete hook stages
 * it, the commit pass stages it for the containers it removes, a report lists it.
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
	const gone = await collectSubtreeIds(query, { records: params.roots })

	const deleted = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>>()
	const cleared = new Map<string, OrphanedRef>()
	let round: readonly Scl.RawRecord<Scl.ElementsOf>[] = params.roots
	while (round.length > 0) {
		// what goes in this round is named by references in turn: a relation a deleted equipment took has its own
		const next: Scl.TrackedRecord<Scl.ElementsOf>[] = []
		for (const orphaned of await findOrphanedRefs({ records: round, query })) {
			const { id } = orphaned.record
			if (gone.has(id)) continue
			if (orphaned.effect === 'cleared') {
				mergeCleared({ cleared, orphaned })
				continue
			}
			gone.add(id)
			deleted.set(id, orphaned.record)
			next.push(orphaned.record)
			if (emptiesContainers) {
				const emptied = await collectEmptiedAbove(query, { record: orphaned.record, gone, kept })
				for (const container of emptied) deleted.set(container.id, container)
				next.push(...emptied)
			}
		}
		round = next
	}
	const stillThere = [...cleared.values()].filter((orphaned) => !gone.has(orphaned.record.id))
	return { gone, deleted: [...deleted.values()], cleared: stillThere }
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
 * The operations of a cascade: each reference cleared, each record deleted (the roots given in `deletedRoots` too),
 * and one update per parent that stays and loses children.
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
	for (const deletedRecord of deleted) {
		operations.push({
			status: 'deleted',
			oldRecord: toRawRecord(deletedRecord),
			newRecord: undefined,
		})
	}
	operations.push(...(await buildParentUpdates(query, { deleted, gone: cascade.gone, pending })))
	return operations
}

/** The record ids of the subtrees of `records`, their wrappers included. */
export async function collectSubtreeIds(
	query: Core.Query<Config>,
	params: { records: readonly Scl.RawRecord<Scl.ElementsOf>[] },
): Promise<Set<string>> {
	const ids = new Set<string>()
	for (const record of params.records)
		await collectSubtreeData({ record, query, ids, uuids: new Set() })
	return ids
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

	const subtreeIds = new Set<string>()
	const subtreeUuids = new Set<string>()
	for (const record of records) {
		await collectSubtreeData({ record, query, ids: subtreeIds, uuids: subtreeUuids })
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

// ── Subtree collection ────────────────────────────────────────────────────────

async function collectSubtreeData(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	query: Core.Query<Config>
	ids: Set<string>
	uuids: Set<string>
}): Promise<void> {
	const { record, query, ids, uuids } = params

	ids.add(record.id)

	const uuid = readAttribute({ record, name: 'uuid' })
	if (uuid) uuids.add(uuid)

	for (const childRef of record.children) {
		const child = await query.getRecord(childRef)
		if (!child) continue
		await collectSubtreeData({ record: child, query, ids, uuids })
	}
}
