import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { PAIRS_BY_REF } from '@/v2019C1/extensions/reference'
import { buildReferencePath } from '@/v2019C1/extensions/reference/query/build'
import { getRefEntriesForTarget, updateRefsForEntry } from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type { RefPairEntry } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Called when a new element is created. Handles two cases:
 *
 * 1. REF created (e.g. FunctionCatRef added) - target may already exist in DB.
 *    Look up target by UUID attr -> compute path -> set pathAttr on the new ref.
 *
 * 2. TARGET created (e.g. Function added) - existing DB refs may point to its UUID.
 *    Scan DB for refs that match this uuid -> set their pathAttr.
 */
export async function setRefPaths<GenericElement extends Scl.ElementsOf>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, query } = params

	const asRef = await setRefPathOnCreatedRef({ childRecord, query })
	const asTarget = await setRefPathsOnCreatedTarget({ childRecord, query })

	return [...asRef, ...asTarget]
}

// ── Case 1: REF created ───────────────────────────────────────────────────────

/**
 * The new element is a REF (e.g. FunctionCatRef).
 * If it carries a uuidAttr, look up the target element by UUID,
 * compute the path from the target's ancestry, set the pathAttr.
 */
async function setRefPathOnCreatedRef<GenericElement extends Scl.ElementsOf>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, query } = params

	const refPairs = PAIRS_BY_REF.get(childRecord.tagName)
	if (!refPairs?.length) return []

	const operations: Scl.Operation[] = []

	for (const pair of refPairs) {
		const operation = await resolveRefPair({ childRecord, pair, query })
		if (operation) operations.push(operation)
	}

	return operations
}

async function resolveRefPair<GenericElement extends Scl.ElementsOf>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	pair: RefPairEntry
	query: Core.Query<Config>
}): Promise<Scl.Operation | null> {
	const { childRecord, pair, query } = params

	const uuidValue = childRecord.attributes.find((a) => a.name === pair.uuidAttr)?.value
	if (!uuidValue) return null

	const targetRecord = await findTargetByUuid({
		uuidValue,
		targetTagNames: pair.targetTagNames,
		query,
	})
	if (!targetRecord) return null

	const reference = { tagName: childRecord.tagName, id: childRecord.id } as Scl.Ref<Scl.ElementsOf>
	const target = { tagName: targetRecord.tagName, id: targetRecord.id } as Scl.Ref<Scl.ElementsOf>
	const newPathValue = await buildReferencePath(query, { reference, target })
	if (!newPathValue) return null

	const updatedAttributes = childRecord.attributes.map((a) =>
		a.name === pair.pathAttr ? { ...a, value: newPathValue } : a,
	)

	return {
		status: 'updated',
		oldRecord: childRecord as unknown as Scl.RawRecord<Scl.ElementsOf>,
		newRecord: {
			...childRecord,
			attributes: updatedAttributes,
		} as unknown as Scl.RawRecord<Scl.ElementsOf>,
	}
}

async function findTargetByUuid(params: {
	uuidValue: string
	targetTagNames: readonly string[]
	query: Core.Query<Config>
}): Promise<{ tagName: string; id: string } | null> {
	const { uuidValue, targetTagNames, query } = params

	for (const targetTagName of targetTagNames) {
		if (!isElementOf(targetTagName, SCL_DIALECTE_CONFIG)) continue
		const candidates = await query.getRecordsByTagName(targetTagName)
		const match = candidates.find(
			(r) => r.attributes.find((a) => a.name === 'uuid')?.value === uuidValue,
		)
		if (match) return { tagName: match.tagName, id: match.id }
	}

	return null
}

// ── Case 2: TARGET created ────────────────────────────────────────────────────

/**
 * The new element is a TARGET (e.g. Function, LNode, ExtRef).
 * Scan DB for existing REF records pointing to its UUID and update their pathAttr.
 */
async function setRefPathsOnCreatedTarget<GenericElement extends Scl.ElementsOf>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, query } = params

	const uuid = childRecord.attributes.find((a) => a.name === 'uuid')?.value
	if (!uuid) return []

	const refEntries = getRefEntriesForTarget(childRecord.tagName)
	if (refEntries.length === 0) return []

	const target = { tagName: childRecord.tagName, id: childRecord.id } as Scl.Ref<Scl.ElementsOf>
	const operations: Scl.Operation[] = []

	for (const entry of refEntries) {
		const ops = await updateRefsForEntry({ uuid, entry, target, query })
		operations.push(...ops)
	}

	return operations
}
