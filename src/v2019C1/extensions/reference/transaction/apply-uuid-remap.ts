import { buildReferencePath } from '../query/build'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Repoint the uuid references of cloned elements onto the clone's fresh
 * identities and recompute their path attributes. Counterpart of
 * {@link applyTypeIdRemap} for the uuid reference system (`UUID_REFERENCE_PAIRS`).
 *
 * Caller-owned, single pass: given the complete `mappings` of an operation, it
 * builds the source-uuid -> target-uuid map once and rewrites every cloned
 * ref-holder. A ref whose target is part of the mappings is repointed; a ref
 * pointing outside them keeps its source uuid. Run it once per operation, with
 * ALL of that operation's clone mappings, BEFORE any pass that reads cloned ref
 * uuids (orphan cleanup, identity restore).
 *
 * Idempotent: a ref already pointing at a target uuid (not a source uuid) is
 * left untouched.
 */
export async function applyUuidRemap(
	tx: Core.Transaction<Config>,
	params: { mappings: readonly Scl.CloneMapping[] },
): Promise<void> {
	const { mappings } = params
	if (mappings.length === 0) return

	// 1. Complete uuid maps from the clone mappings — one pass.
	const uuidMap = new Map<string, string>() // source uuid -> target uuid
	const uuidToRef = new Map<string, { tagName: string; id: string }>() // target uuid -> ref
	for (const { source, target } of mappings) {
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
	if (uuidMap.size === 0) return

	// 2. Repoint each cloned ref-holder's uuid attrs and recompute its paths.
	for (const { target } of mappings) {
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
}
