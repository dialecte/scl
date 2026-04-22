import { UUID_REFERENCE_PAIRS, KEEP_ON_ORPHAN_REFS } from '@/v2019C1/extensions/reference'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Walks every UUID reference pair in the target DB.
 * - Target found → keep as-is
 * - Target absent + keep-on-orphan → clear uuid/path/companion attrs
 * - Target absent + delete-on-orphan → delete record
 */
export async function orphanUuidRefs(tx: Core.Transaction<Config>): Promise<void> {
	const refTagNames = Object.keys(UUID_REFERENCE_PAIRS) as (keyof typeof UUID_REFERENCE_PAIRS)[]

	for (const refTagName of refTagNames) {
		const refPairs = UUID_REFERENCE_PAIRS[refTagName]
		const refRecords = await tx.getRecordsByTagName(refTagName)

		for (const ref of refRecords) {
			let hasAnyUuidAttr = false
			let hasAnyValidRef = false
			const attributesToClear: Record<string, undefined> = {}

			for (const refPair of refPairs) {
				const uuidValue = await tx.getAttribute(ref, {
					name: refPair.attribute.uuid as Scl.AttributesOf<typeof ref.tagName>,
				})
				if (!uuidValue) continue

				hasAnyUuidAttr = true
				const found = await findTargetByUuid(tx, uuidValue, refPair.target)

				if (found) {
					hasAnyValidRef = true
				} else {
					attributesToClear[refPair.attribute.uuid] = undefined
					attributesToClear[refPair.attribute.path] = undefined
					for (const companion of refPair.companions) {
						attributesToClear[companion.name] = undefined
					}
				}
			}

			if (Object.keys(attributesToClear).length > 0) {
				await tx.update(ref, { attributes: attributesToClear })
			}

			const keepOnOrphan = KEEP_ON_ORPHAN_REFS.has(refTagName)
			const shouldDelete = hasAnyUuidAttr && !hasAnyValidRef && !keepOnOrphan
			if (shouldDelete) await tx.delete(ref)
		}
	}
}

// ── Local helpers ───────────────────────────────────────────────────────────

async function findTargetByUuid(
	tx: Core.Transaction<Config>,
	uuid: string,
	targetTagNames: readonly string[],
): Promise<boolean> {
	for (const tagName of targetTagNames) {
		const [found] = await tx.findByAttributes({
			tagName: tagName as Scl.ElementsOf,
			attributes: { uuid },
		})
		if (found) return true
	}
	return false
}
