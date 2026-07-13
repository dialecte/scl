import { toRawRecord } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { KEEP_ON_ORPHAN_REFS } from '@/v2019C1/extensions/reference'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

// ── Orphaned refs cleanup ─────────────────────────────────────────────────────

/**
 * Collects all UUIDs from the deleted subtree, then for each external ref
 * pointing to one of those UUIDs:
 * - KEEP_ON_ORPHAN_REFS → clear uuid / path / companion attrs.
 * - Others → stage delete + update parent's children list.
 *
 * Refs that are themselves inside the deleted subtree are skipped —
 * the cascade in stageDelete handles them.
 */
export async function cleanOrphanedRefs<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { record, query } = params

	const subtreeIds = new Set<string>()
	const subtreeUuids = new Set<string>()
	await collectSubtreeData({ record, query, ids: subtreeIds, uuids: subtreeUuids })

	if (subtreeUuids.size === 0) return []

	const operations: Scl.Operation[] = []
	const refTagNames = Object.keys(UUID_REFERENCE_PAIRS) as (keyof typeof UUID_REFERENCE_PAIRS)[]

	for (const refTagName of refTagNames) {
		const ops = await processRefTagName({ refTagName, subtreeIds, subtreeUuids, query })
		operations.push(...ops)
	}

	return operations
}

// ── Per-tagName scanning ──────────────────────────────────────────────────────

async function processRefTagName(params: {
	refTagName: keyof typeof UUID_REFERENCE_PAIRS
	subtreeIds: Set<string>
	subtreeUuids: Set<string>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { refTagName, subtreeIds, subtreeUuids, query } = params

	const refPairs = UUID_REFERENCE_PAIRS[refTagName]
	const refRecords = await query.getRecordsByTagName(refTagName)
	const operations: Scl.Operation[] = []

	for (const refRecord of refRecords) {
		if (subtreeIds.has(refRecord.id)) continue

		const ops = await processOrphanedRef({ refTagName, refRecord, refPairs, subtreeUuids, query })
		operations.push(...ops)
	}

	return operations
}

// ── Per-ref orphan check ──────────────────────────────────────────────────────

type RefPairs = (typeof UUID_REFERENCE_PAIRS)[keyof typeof UUID_REFERENCE_PAIRS]

async function processOrphanedRef(params: {
	refTagName: keyof typeof UUID_REFERENCE_PAIRS
	refRecord: Scl.TrackedRecord<Scl.ElementsOf>
	refPairs: RefPairs
	subtreeUuids: Set<string>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { refTagName, refRecord, refPairs, subtreeUuids, query } = params

	const attrsToClear = collectOrphanedAttrs({ refPairs, refRecord, subtreeUuids })
	if (attrsToClear.size === 0) return []

	if (KEEP_ON_ORPHAN_REFS.has(refTagName)) {
		return [buildClearedAttributesOp(refRecord, attrsToClear)]
	}

	return buildDeleteRefOps(refRecord, query)
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
		const uuidValue = refRecord.attributes.find(
			(attribute) => attribute.name === pair.attribute.uuid,
		)?.value
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
	attributesToClear: Set<string>,
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

	const uuid = record.attributes.find((attribute) => attribute.name === 'uuid')?.value
	if (uuid) uuids.add(uuid)

	for (const childRef of record.children) {
		const child = await query.getRecord(childRef)
		if (!child) continue
		await collectSubtreeData({ record: child, query, ids, uuids })
	}
}
