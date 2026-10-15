import { widen } from '@dialecte/core/helpers'

import { PAIRS_BY_REF, REF_ENTRIES_BY_TARGET } from '@/v2019C1/extensions/reference'
import {
	buildOwnDerivedAttributes,
	buildReferenceAttributes,
} from '@/v2019C1/extensions/reference/query/build/build-reference-attributes'
import {
	findTargetByUuid,
	rebuildReferencesByUuid,
	reconcileMappedData,
	updatedOperation,
	withAttributeValues,
} from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type { AttributeList } from '@/v2019C1/hooks/shared/record-ops'
import type * as Core from '@dialecte/core'

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Called when a new element is created. Handles two cases:
 *
 * 1. REF created (e.g. FunctionCatRef added) - target may already exist in DB.
 *    Look up target by UUID attr -> compute path -> set pathAttr on the new ref, with the
 *    attributes it writes from the target's path (a terminal's level names). An element that
 *    writes attributes from its own path (a connectivity node's `pathName`) gets them too.
 *
 * 2. TARGET created (e.g. Function added) - existing DB refs may point to its UUID.
 *    Scan DB for refs that match this uuid -> set their pathAttr.
 */
export async function setRefPaths<GenericElement extends Scl.ElementsOf>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, query } = params

	const asRef = await setPathAttributesOfCreated({ childRecord, query })
	const asTarget = await setRefPathsOnCreatedTarget({ childRecord, query })

	const mappedNameOp = await reconcileMappedData(query, { record: widen(childRecord) })
	const asMappedName = mappedNameOp ? [mappedNameOp] : []

	return [...asRef, ...asTarget, ...asMappedName]
}

// ── Case 1: REF created ───────────────────────────────────────────────────────

/**
 * The new element is a REF (e.g. FunctionCatRef): for each pair whose uuid names an element,
 * the attributes the reference holds for it. Then the attributes it writes from its own path.
 * Everything lands in one update of the record: an update per pair would each start from the
 * created attributes and only the last would stay.
 */
async function setPathAttributesOfCreated<GenericElement extends Scl.ElementsOf>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, query } = params

	const record = widen(childRecord)
	const reference = { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>
	let attributes: AttributeList = record.attributes

	for (const pair of PAIRS_BY_REF.get(record.tagName) ?? []) {
		const uuid = record.attributes.find((attribute) => attribute.name === pair.uuidAttr)?.value
		const target = uuid
			? await findTargetByUuid(query, { uuid, targetTagNames: pair.targetTagNames })
			: undefined
		if (!target) continue
		const values = await buildReferenceAttributes(query, { reference, target })
		attributes = withAttributeValues(attributes, values)
	}

	const ownValues = await buildOwnDerivedAttributes(query, { element: reference })
	attributes = withAttributeValues(attributes, ownValues)

	if (attributes === record.attributes) return []
	return [updatedOperation(record, attributes)]
}

// ── Case 2: TARGET created ────────────────────────────────────────────────────

/**
 * The new element is a TARGET (e.g. Function, LNode, ConnectivityNode): the existing references
 * that carry its uuid get their path, and the attributes they write from it.
 */
async function setRefPathsOnCreatedTarget<GenericElement extends Scl.ElementsOf>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, query } = params

	const uuid = childRecord.attributes.find((attribute) => attribute.name === 'uuid')?.value
	if (!uuid || !REF_ENTRIES_BY_TARGET.has(childRecord.tagName)) return []

	const target = { tagName: childRecord.tagName, id: childRecord.id } as Scl.Ref<Scl.ElementsOf>
	return rebuildReferencesByUuid(query, { uuid, target })
}
