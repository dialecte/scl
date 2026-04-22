import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG, Scl } from '@/v2019C1/config'
import {
	RESOLVABLE_RESOLUTIONS,
	RESOLUTION_TARGET_REFS,
} from '@/v2019C1/extensions/reference/constants'

import type { ResolvedReference } from './find-refs-pointing-to.types'
import type { RefEntry } from '@/v2019C1/extensions/reference'

/**
 * Find all REF records that reference a target element by UUID,
 * and resolve each to its nearest ancestor of a specific container tagName.
 *
 * Uses UUID_REFERENCE_PAIRS to discover which REF elements + uuid attributes
 * point to the target's tagName, then queries the DB for matches.
 */
export async function findRefsPointingTo(
	query: Scl.Query,
	params: {
		target: Scl.Ref<Scl.ElementsOf>
		containerTagName?: Scl.ElementsOf
	},
): Promise<ResolvedReference[]> {
	const { target, containerTagName } = params

	const targetRecord = await query.getRecord(target)
	if (!targetRecord) return []

	const uuid = targetRecord.attributes.find((a) => a.name === 'uuid')?.value
	if (!uuid) return []

	const entries = getRefEntriesForTarget(targetRecord.tagName)
	if (entries.length === 0) return []

	const results: ResolvedReference[] = []

	for (const entry of entries) {
		if (!isElementOf(entry.refTagName, SCL_DIALECTE_CONFIG)) continue

		const refRecords = await query.findByAttributes({
			tagName: entry.refTagName as Scl.ElementsOf,
			attributes: { [entry.uuidAttr]: uuid },
		})

		for (const ref of refRecords) {
			const container = containerTagName
				? await findAncestorByTagName(query, ref, containerTagName)
				: undefined
			results.push({ ref, container })
		}
	}

	return results
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRefEntriesForTarget(tagName: string): RefEntry[] {
	const entries: RefEntry[] = []
	for (const resolution of RESOLVABLE_RESOLUTIONS) {
		const found = RESOLUTION_TARGET_REFS[resolution].get(tagName)
		if (found) entries.push(...found)
	}
	return entries
}

async function findAncestorByTagName(
	query: Scl.Query,
	record: Scl.TrackedRecord<Scl.ElementsOf>,
	tagName: Scl.ElementsOf,
): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const ancestors = await query.findAncestors(record, { stopAtTagName: tagName })
	return ancestors.find((ancestor) => ancestor.tagName === tagName)
}
