import { toRawRecord } from '@dialecte/core/helpers'

import { KEEP_ON_ORPHAN_REFS, REFERENCE_TAGS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { OrphanedRef, RefPairs } from './orphaned-refs.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

// ── Orphaned refs cleanup ─────────────────────────────────────────────────────

/**
 * Stage what {@link findOrphanedRefs} finds for the deleted subtree: a reference keeping its content has its uuid,
 * path and companion attributes cleared; any other is deleted and its parent's children list updated.
 */
export async function cleanOrphanedRefs<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { query } = params
	const operations: Scl.Operation[] = []
	for (const orphaned of await findOrphanedRefs(params)) {
		if (orphaned.effect === 'cleared') {
			operations.push(buildClearedAttributesOp(orphaned.record, orphaned.attributes))
		} else {
			operations.push(...(await buildDeleteRefOps(orphaned.record, query)))
		}
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

async function buildDeleteRefOps(
	refRecord: Scl.TrackedRecord<Scl.ElementsOf>,
	query: Core.Query<Config>,
): Promise<Scl.Operation[]> {
	const operations: Scl.Operation[] = [
		{ status: 'deleted', oldRecord: toRawRecord(refRecord), newRecord: undefined },
	]

	if (refRecord.parent) {
		const parentRecord = await query.getRecord(refRecord.parent)
		if (parentRecord) {
			const updatedParent = {
				...parentRecord,
				children: parentRecord.children.filter((c) => c.id !== refRecord.id),
			}
			operations.push({
				status: 'updated',
				oldRecord: toRawRecord(parentRecord),
				newRecord: toRawRecord(updatedParent),
			})
		}
	}

	return operations
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
