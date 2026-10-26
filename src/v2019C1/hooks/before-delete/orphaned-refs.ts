import { toRawRecord, widen } from '@dialecte/core/helpers'

import { KEEP_ON_ORPHAN_REFS, REFERENCE_TAGS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { PRUNED_WHEN_EMPTY } from '@/v2019C1/extensions/clean-up/transaction/prune-empty-containers.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { OrphanedRef, RefPairs } from './orphaned-refs.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

// ── Orphaned refs cleanup ─────────────────────────────────────────────────────

/**
 * Stage what the deletion of a subtree does to what refers to it ({@link findOrphanedRefs}): a reference keeping its
 * content has its uuid, path and companion attributes cleared; any other is deleted. A container a deleted reference
 * leaves holding nothing goes too when it has no reason to stay (`PRUNED_WHEN_EMPTY`: a category without its last
 * reference, the wrapper it leaves empty), and what refers to that container in turn — the operations staged here do
 * not run the hooks again. Each parent losing children is updated once.
 */
export async function cleanOrphanedRefs<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { record, query } = params
	const gone = new Set<string>()
	await collectSubtreeData({ record, query, ids: gone, uuids: new Set() })

	const deleted = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>>()
	const cleared = new Map<string, OrphanedRef>()
	const removedRoots: Scl.RawRecord<Scl.ElementsOf>[] = [widen(record)]
	for (let index = 0; index < removedRoots.length; index++) {
		for (const orphaned of await findOrphanedRefs({ record: removedRoots[index], query })) {
			const { id } = orphaned.record
			if (gone.has(id)) continue
			if (orphaned.effect === 'cleared') {
				mergeCleared({ cleared, orphaned })
				continue
			}
			gone.add(id)
			deleted.set(id, orphaned.record)
			const emptied = await collectEmptiedContainers(query, { record: orphaned.record, gone })
			for (const container of emptied) deleted.set(container.id, container)
			removedRoots.push(...emptied)
		}
	}

	const operations: Scl.Operation[] = []
	for (const orphaned of cleared.values()) {
		if (!gone.has(orphaned.record.id)) {
			operations.push(buildClearedAttributesOp(orphaned.record, orphaned.attributes))
		}
	}
	for (const deletedRecord of deleted.values()) {
		operations.push({
			status: 'deleted',
			oldRecord: toRawRecord(deletedRecord),
			newRecord: undefined,
		})
	}
	operations.push(...(await buildParentUpdates(query, { deleted: [...deleted.values()], gone })))
	return operations
}

/** Record a reference cleared, the attributes of each removal naming it together. */
function mergeCleared(params: { cleared: Map<string, OrphanedRef>; orphaned: OrphanedRef }): void {
	const { cleared, orphaned } = params
	const known = cleared.get(orphaned.record.id)
	const attributes = new Set([...(known?.attributes ?? []), ...orphaned.attributes])
	cleared.set(orphaned.record.id, { ...orphaned, attributes })
}

/**
 * The containers above a deleted reference left holding nothing once everything `gone` is gone, walked up while each
 * has no reason to stay; each is added to `gone`.
 */
async function collectEmptiedContainers(
	query: Core.Query<Config>,
	params: { record: Scl.TrackedRecord<Scl.ElementsOf>; gone: Set<string> },
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { gone } = params
	const emptied: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	let parentRef = params.record.parent
	while (parentRef && PRUNED_WHEN_EMPTY.has(parentRef.tagName)) {
		const parent: Scl.TrackedRecord<Scl.ElementsOf> | undefined = await query.getRecord(parentRef)
		if (!parent?.parent || parent.value.trim() !== '') break
		if (parent.children.some((child) => !gone.has(child.id))) break
		gone.add(parent.id)
		emptied.push(parent)
		parentRef = parent.parent
	}
	return emptied
}

/** One update per parent that stays and loses children: its children list without them. */
async function buildParentUpdates(
	query: Core.Query<Config>,
	params: { deleted: readonly Scl.TrackedRecord<Scl.ElementsOf>[]; gone: ReadonlySet<string> },
): Promise<Scl.Operation[]> {
	const { deleted, gone } = params
	const parentIds = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const deletedRecord of deleted) {
		const { parent } = deletedRecord
		if (parent && !gone.has(parent.id)) parentIds.set(parent.id, parent as Scl.Ref<Scl.ElementsOf>)
	}
	const operations: Scl.Operation[] = []
	for (const parentRef of parentIds.values()) {
		const parentRecord = await query.getRecord(parentRef)
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
 * The references outside a subtree that name an element of it, each with what its deletion does to them:
 * `cleared` for a reference keeping its content (`KEEP_ON_ORPHAN_REFS`: its uuid, path and companion attributes go),
 * `deleted` for any other. A reference inside the subtree goes with it. Read only: the delete hook stages it, a
 * report lists it.
 */
export async function findOrphanedRefs<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<OrphanedRef[]> {
	const { record, query } = params

	const subtreeIds = new Set<string>()
	const subtreeUuids = new Set<string>()
	await collectSubtreeData({ record, query, ids: subtreeIds, uuids: subtreeUuids })
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

async function collectSubtreeData<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
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
