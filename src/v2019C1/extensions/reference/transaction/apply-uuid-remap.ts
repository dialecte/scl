import { buildReferencePath } from '../query/build'
import { readRawAttribute } from '../query/build/raw-attribute'
import { relativeIedName } from '../query/ied-tuple/own-ied-name'
import { targetTupleParts } from '../query/ied-tuple/target-tuple-address'
import { tupleReferenceWrite } from '../query/ied-tuple/tuple-reference-write'

import { toRawRecord } from '@dialecte/core/helpers'

import { TUPLE_REFERENCE_PAIRS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { TupleTargetParts } from '../query/ied-tuple/ied-tuple.types'
import type { RedirectMapping } from './apply-uuid-remap.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Repoint the uuid references of cloned elements onto the clone's fresh
 * identities and recompute their path attributes. Counterpart of
 * {@link applyTypeIdRemap} for the uuid reference system (`UUID_REFERENCE_PAIRS`).
 *
 * Caller-owned, single pass: given the complete `cloneMappings` of an operation, it
 * builds the source-uuid -> target-uuid map once and rewrites every cloned
 * ref-holder. A ref whose target is part of the mappings, or of the redirect mappings (a source
 * element mapped onto an element the target already holds), is repointed; a ref pointing
 * outside them keeps its source uuid. Run it once per operation, with
 * ALL of that operation's clone mappings, BEFORE any pass that reads cloned ref
 * uuids (orphan cleanup, identity restore).
 *
 * Idempotent: a ref already pointing at a target uuid (not a source uuid) is
 * left untouched.
 */
export async function applyUuidRemap(
	tx: Core.Transaction<Config>,
	params: {
		cloneMappings: readonly Scl.CloneMapping[]
		/** Source elements mapped onto existing target elements instead of being cloned. */
		redirectMappings?: readonly RedirectMapping[]
	},
): Promise<void> {
	const { cloneMappings, redirectMappings = [] } = params
	if (cloneMappings.length === 0) return

	// 1. Complete uuid maps from the clone mappings and the redirect mappings — one pass.
	const uuidMap = new Map<string, string>() // source uuid -> target uuid
	const uuidToRef = new Map<string, { tagName: string; id: string }>() // target uuid -> ref
	for (const { source, target } of cloneMappings) {
		const sourceUuid = source.attributes.find((attribute) => attribute.name === 'uuid')?.value
		if (!sourceUuid) continue
		const targetRecord = await tx.getRecord(target)
		const targetUuid = targetRecord?.attributes.find(
			(attribute) => attribute.name === 'uuid',
		)?.value
		if (!targetUuid) continue
		uuidMap.set(sourceUuid, targetUuid)
		uuidToRef.set(targetUuid, { tagName: targetRecord.tagName, id: targetRecord.id })
	}
	for (const { sourceUuid, target } of redirectMappings) {
		const targetRecord = await tx.getRecord(target)
		const targetUuid = targetRecord?.attributes.find(
			(attribute) => attribute.name === 'uuid',
		)?.value
		if (!targetUuid) continue
		uuidMap.set(sourceUuid, targetUuid)
		uuidToRef.set(targetUuid, { tagName: targetRecord.tagName, id: targetRecord.id })
	}
	if (uuidMap.size === 0) return

	// 2. Repoint each cloned ref-holder's uuid attrs and recompute its paths.
	for (const { target } of cloneMappings) {
		if (!(target.tagName in UUID_REFERENCE_PAIRS)) continue
		const refRecord = await tx.getRecord(target)
		if (!refRecord) continue

		const pairs = UUID_REFERENCE_PAIRS[target.tagName as keyof typeof UUID_REFERENCE_PAIRS]
		const updates: Record<string, string> = {}

		for (const pair of pairs) {
			const currentUuid = refRecord.attributes.find(
				(attribute) => attribute.name === pair.attribute.uuid,
			)?.value
			if (!currentUuid) continue

			const newUuid = uuidMap.get(currentUuid)
			if (!newUuid || newUuid === currentUuid) continue

			updates[pair.attribute.uuid] = newUuid

			const targetMeta = uuidToRef.get(newUuid)
			if (!targetMeta) continue
			const newPath = await buildReferencePath(tx, {
				reference: { tagName: target.tagName, id: refRecord.id } as Scl.Ref<Scl.ElementsOf>,
				target: { tagName: targetMeta.tagName, id: targetMeta.id } as Scl.Ref<Scl.ElementsOf>,
			})
			const currentPath = refRecord.attributes.find(
				(attribute) => attribute.name === pair.attribute.path,
			)?.value
			if (newPath && newPath !== currentPath) updates[pair.attribute.path] = newPath
		}

		if (Object.keys(updates).length > 0) await tx.update(refRecord, { attributes: updates })
	}

	await remapTupleReferences(tx, { cloneMappings, uuidMap, uuidToRef })
}

/**
 * The cloned references of the IED section named by a tuple of attributes: a uuid naming an element
 * cloned with them, or mapped onto an element the document already holds, is repointed onto that
 * element, and the reference writes its names (see `tupleReferenceWrite`).
 */
async function remapTupleReferences(
	tx: Core.Transaction<Config>,
	params: {
		cloneMappings: readonly Scl.CloneMapping[]
		uuidMap: ReadonlyMap<string, string>
		uuidToRef: ReadonlyMap<string, { tagName: string; id: string }>
	},
): Promise<void> {
	const { cloneMappings, uuidMap, uuidToRef } = params
	const referrers: { record: AnyRawRecord; pairs: readonly TupleReferencePair[] }[] = []
	const remapped = new Set<string>()
	for (const { target } of cloneMappings) {
		const pairs: readonly TupleReferencePair[] | undefined =
			TUPLE_REFERENCE_PAIRS[target.tagName as keyof typeof TUPLE_REFERENCE_PAIRS]
		if (!pairs) continue
		const tracked = await tx.getRecord(target)
		if (!tracked) continue
		const record = toRawRecord(tracked) as AnyRawRecord
		referrers.push({ record, pairs })
		for (const pair of pairs) {
			const uuid = readRawAttribute({ record, name: pair.attribute.uuid })
			const targetUuid = uuid ? uuidMap.get(uuid) : undefined
			if (targetUuid) remapped.add(targetUuid)
		}
	}

	const partsByUuid = new Map<string, TupleTargetParts | undefined>()
	for (const uuid of remapped) {
		const parts = await targetPartsOf(tx, { ref: uuidToRef.get(uuid) })
		partsByUuid.set(uuid, parts)
	}

	for (const { record, pairs } of referrers) {
		const ownIedName = await relativeIedName(tx, { record, pairs })
		const write = tupleReferenceWrite({ record, pairs, partsByUuid, ownIedName, retarget: uuidMap })
		if (!write) continue
		await tx.any.update(record, {
			// an attribute set to undefined is removed (the update strips it)
			attributes: write.attributes as Record<string, string>,
			...(write.value === undefined ? {} : { value: write.value }),
		})
	}
}

/** The address parts of the element a remapped uuid names. */
async function targetPartsOf(
	tx: Core.Transaction<Config>,
	params: { ref: { tagName: string; id: string } | undefined },
): Promise<TupleTargetParts | undefined> {
	const ref = params.ref as Scl.Ref<Scl.ElementsOf> | undefined
	if (!ref) return undefined
	const record = await tx.getRecord(ref)
	if (!record) return undefined
	const ancestors = await tx.findAncestors(ref)
	return targetTupleParts({
		record: toRawRecord(record) as AnyRawRecord,
		ancestry: [...ancestors].reverse() as AnyRawRecord[],
	})
}
