import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG, Scl, Config } from '@/v2019C1/config'
import {
	RESOLVABLE_RESOLUTIONS,
	RESOLUTION_TARGET_REFS,
	TYPE_ID_REFERRERS_BY_TARGET,
} from '@/v2019C1/extensions/reference/constants'
import { isTypeIdTarget } from '@/v2019C1/extensions/reference/guards'

import type { ResolvedReference } from './find-refs-pointing-to.types'
import type { RefEntry, TypeIdReferrer, TypeIdTarget } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * Find all REF records that reference a target element, and resolve each to its
 * nearest ancestor of a specific container tagName.
 *
 * Two reference systems are covered uniformly:
 * - **uuid-pair refs** (`UUID_REFERENCE_PAIRS`) — matched on the target `uuid`;
 * - **type-id refs** (`TYPE_ID_REFERENCE_PAIRS`) — when the target is a
 *   DataTypeTemplates type (LNodeType/DOType/DAType/EnumType), matched on the
 *   target `id` (`lnType`, `DO.type`, `DA.type`, …).
 */
export async function findRefsPointingTo(
	query: Core.Query<Config>,
	params: {
		target: Scl.Ref<Scl.ElementsOf>
		containerTagName?: Scl.ElementsOf
	},
): Promise<ResolvedReference[]> {
	const { target, containerTagName } = params

	const targetRecord = await query.getRecord(target)
	if (!targetRecord) return []

	if (isTypeIdTarget(targetRecord.tagName)) {
		return findTypeIdReferrers(query, targetRecord, containerTagName)
	}

	return findUuidReferrers(query, targetRecord, containerTagName)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Referrers via the uuid-pair system, matched on the target `uuid`. */
async function findUuidReferrers(
	query: Core.Query<Config>,
	targetRecord: Scl.TrackedRecord<Scl.ElementsOf>,
	containerTagName?: Scl.ElementsOf,
): Promise<ResolvedReference[]> {
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

/** Referrers of a DataTypeTemplates type, matched on its `id` (type-id refs). */
async function findTypeIdReferrers(
	query: Core.Query<Config>,
	targetRecord: Scl.TrackedRecord<Scl.ElementsOf>,
	containerTagName?: Scl.ElementsOf,
): Promise<ResolvedReference[]> {
	const id = targetRecord.attributes.find((a) => a.name === 'id')?.value
	if (!id) return []

	const referrers = TYPE_ID_REFERRERS_BY_TARGET.get(targetRecord.tagName as TypeIdTarget) ?? []
	const results: ResolvedReference[] = []

	for (const referrer of referrers) {
		if (!isElementOf(referrer.refTagName, SCL_DIALECTE_CONFIG)) continue

		const refRecords = await query.findByAttributes({
			tagName: referrer.refTagName as Scl.ElementsOf,
			attributes: { [referrer.attribute]: id },
		})

		for (const ref of refRecords) {
			if (!matchesWhen(ref, referrer)) continue
			const container = containerTagName
				? await findAncestorByTagName(query, ref, containerTagName)
				: undefined
			results.push({ ref, container })
		}
	}

	return results
}

/** Honour a referrer's optional discriminator (e.g. DA.bType === 'Enum'). */
function matchesWhen(ref: Scl.TrackedRecord<Scl.ElementsOf>, referrer: TypeIdReferrer): boolean {
	if (!referrer.when) return true
	const value = ref.attributes.find((a) => a.name === referrer.when!.attribute)?.value
	return value === referrer.when.equals
}

function getRefEntriesForTarget(tagName: string): RefEntry[] {
	const entries: RefEntry[] = []
	for (const resolution of RESOLVABLE_RESOLUTIONS) {
		const found = RESOLUTION_TARGET_REFS[resolution].get(tagName)
		if (found) entries.push(...found)
	}
	return entries
}

async function findAncestorByTagName(
	query: Core.Query<Config>,
	record: Scl.TrackedRecord<Scl.ElementsOf>,
	tagName: Scl.ElementsOf,
): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const ancestors = await query.findAncestors(record, { stopAtTagName: tagName })
	return ancestors.find((ancestor) => ancestor.tagName === tagName)
}
