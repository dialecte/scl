import { toRawRecord } from '@dialecte/core/helpers'

import { reference, UUID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference'

import type { Scl, Config } from '@/v2019C1/config'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * Re-sweep all cloned REF elements:
 *  1. Remap their UUID reference attrs (source uuid -> new clone uuid).
 *  2. Recompute their path attrs from the now-visible cloned target elements.
 */
export async function remapClonedRefPaths(params: {
	cumulativeCloneMappings: Scl.CloneMapping[]
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { cumulativeCloneMappings, query } = params

	const { uuidMap, uuidToRef } = await buildUuidMaps(cumulativeCloneMappings, query)
	if (uuidMap.size === 0) return []

	const operations: Scl.Operation[] = []

	for (const { target } of cumulativeCloneMappings) {
		const operation = await remapClonedRef({ target, uuidMap, uuidToRef, query })
		if (operation) operations.push(operation)
	}

	return operations
}

// ── Build uuid remapping tables ───────────────────────────────────────────────

async function buildUuidMaps(
	mappings: Scl.CloneMapping[],
	query: Core.Query<Config>,
): Promise<{
	uuidMap: Map<string, string>
	uuidToRef: Map<string, { tagName: string; id: string }>
}> {
	const uuidMap = new Map<string, string>()
	const uuidToRef = new Map<string, { tagName: string; id: string }>()

	for (const { source, target } of mappings) {
		await registerMappingUuids({ source, target, query, uuidMap, uuidToRef })
	}

	return { uuidMap, uuidToRef }
}

async function registerMappingUuids(params: {
	source: Scl.CloneMapping['source']
	target: Scl.CloneMapping['target']
	query: Core.Query<Config>
	uuidMap: Map<string, string>
	uuidToRef: Map<string, { tagName: string; id: string }>
}): Promise<void> {
	const { source, target, query, uuidMap, uuidToRef } = params

	const tgtRecord = await query.getRecord(target)
	if (!tgtRecord) return

	const sourceUuid = source.attributes.find((attribute) => attribute.name === 'uuid')?.value
	const targetUuid = tgtRecord.attributes.find((attribute) => attribute.name === 'uuid')?.value
	if (!sourceUuid || !targetUuid) return

	uuidMap.set(sourceUuid, targetUuid)
	uuidToRef.set(targetUuid, { tagName: tgtRecord.tagName, id: tgtRecord.id })
}

// ── Remap a single cloned REF element ─────────────────────────────────────────

async function remapClonedRef(params: {
	target: Scl.CloneMapping['target']
	uuidMap: Map<string, string>
	uuidToRef: Map<string, { tagName: string; id: string }>
	query: Core.Query<Config>
}): Promise<Scl.Operation | null> {
	const { target, uuidMap, uuidToRef, query } = params
	const tagName = target.tagName

	if (!(tagName in UUID_REFERENCE_PAIRS)) return null

	const refRecord = await query.getRecord(target)
	if (!refRecord) return null

	const pairs = UUID_REFERENCE_PAIRS[tagName as keyof typeof UUID_REFERENCE_PAIRS]
	let updatedAttributes = [...refRecord.attributes]
	let changed = false

	for (const pair of pairs) {
		const result = await remapPair({
			pair,
			tagName,
			refId: refRecord.id,
			updatedAttributes,
			uuidMap,
			uuidToRef,
			query,
		})
		if (result) {
			updatedAttributes = result as typeof updatedAttributes
			changed = true
		}
	}

	if (!changed) return null

	return {
		status: 'updated',
		oldRecord: toRawRecord(refRecord),
		newRecord: toRawRecord({ ...refRecord, attributes: updatedAttributes }),
	}
}

// ── Remap uuid + recompute path for a single pair ─────────────────────────────

async function remapPair(params: {
	pair: ReferencePair
	tagName: string
	refId: string
	updatedAttributes: readonly { name: string; value: string }[]
	uuidMap: Map<string, string>
	uuidToRef: Map<string, { tagName: string; id: string }>
	query: Core.Query<Config>
}): Promise<{ name: string; value: string }[] | null> {
	const { pair, tagName, refId, uuidMap, uuidToRef, query } = params
	let attributes = [...params.updatedAttributes]

	const currentUuid = attributes.find((a) => a.name === pair.attribute.uuid)?.value
	if (!currentUuid) return null

	const newUuid = uuidMap.get(currentUuid)
	if (!newUuid) return null

	let changed = false

	const uuidResult = remapUuidAttribute(attributes, pair.attribute.uuid, currentUuid, newUuid)
	if (uuidResult) {
		attributes = uuidResult
		changed = true
	}

	const pathResult = await recomputePathAttribute({
		attributes,
		pathAttrName: pair.attribute.path,
		newUuid,
		uuidToRef,
		tagName,
		refId,
		query,
	})
	if (pathResult) {
		attributes = pathResult
		changed = true
	}

	return changed ? attributes : null
}

function remapUuidAttribute(
	attributes: { name: string; value: string }[],
	uuidAttrName: string,
	currentUuid: string,
	newUuid: string,
): { name: string; value: string }[] | null {
	if (newUuid === currentUuid) return null
	return attributes.map((a) => (a.name === uuidAttrName ? { ...a, value: newUuid } : a))
}

async function recomputePathAttribute(params: {
	attributes: { name: string; value: string }[]
	pathAttrName: string
	newUuid: string
	uuidToRef: Map<string, { tagName: string; id: string }>
	tagName: string
	refId: string
	query: Core.Query<Config>
}): Promise<{ name: string; value: string }[] | null> {
	const { attributes, pathAttrName, newUuid, uuidToRef, tagName, refId, query } = params

	const targetMeta = uuidToRef.get(newUuid)
	if (!targetMeta) return null

	const newPathValue = await reference.query.buildReferencePath(query, {
		reference: { tagName, id: refId } as Scl.Ref<Scl.ElementsOf>,
		target: { tagName: targetMeta.tagName, id: targetMeta.id } as Scl.Ref<Scl.ElementsOf>,
	})
	if (!newPathValue) return null

	const currentPathValue = attributes.find((a) => a.name === pathAttrName)?.value
	if (currentPathValue === newPathValue) return null

	return attributes.map((a) => (a.name === pathAttrName ? { ...a, value: newPathValue } : a))
}
