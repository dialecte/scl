import { findMappedDataFollowingLn } from './find-mapped-data-following-ln'

import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG, Scl, Config } from '@/v2019C1/config'
import { TYPE_ID_REFERRERS_BY_TARGET } from '@/v2019C1/extensions/reference/constants'
import { UUID_REFERRERS_BY_TARGET } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { isTypeIdTarget } from '@/v2019C1/extensions/reference/guards'
import { readAttribute } from '@/v2019C1/helpers'

import type { ResolvedReference } from './find-refs-pointing-to.types'
import type { TypeIdReferrer, TypeIdTarget } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * Find all REF records that reference a target element, and resolve each to its
 * nearest ancestor of a specific container tagName.
 *
 * Two reference systems are covered uniformly:
 * - **uuid refs** — matched on the target `uuid`: the uuid pairs (`UUID_REFERENCE_PAIRS`) and the tuple
 *   references naming an IED-section element by a uuid beside their names (`TUPLE_REFERENCE_PAIRS`: an
 *   `FCDA` / `ExtRef` / LNode naming a logical node, a `ConnectedAP` / `ServerAt` an access point, ...);
 * - **type-id refs** (`TYPE_ID_REFERENCE_PAIRS`) — when the target is a
 *   DataTypeTemplates type (LNodeType/DOType/DAType/EnumType), matched on the
 *   target `id` (`lnType`, `DO.type`, `DA.type`, …).
 *
 * For an `LN` / `LN0` target, the `DOS` / `SDS` / `DAS` it implements by default (they
 * carry no `mappedLnUuid`) are included too.
 *
 * @intent find who references an element, list references to a target before deleting or renaming, usages of a data type (LNodeType/DOType/DAType), where an LNode or Function is used, who subscribes to or names a logical node or access point
 */
export async function findRefsPointingTo(
	query: Core.Query<Config>,
	params: {
		target: Scl.Ref<Scl.ElementsOf>
		containerTagName?: Scl.ElementsOf
	},
): Promise<ResolvedReference[]> {
	const { target, containerTagName } = params
	const referrers = await findReferrers(query, { target })
	return withContainers(query, { referrers, containerTagName })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** The records referencing the target: type-id referrers, or uuid referrers then the data following an LN. */
async function findReferrers(
	query: Core.Query<Config>,
	params: { target: Scl.Ref<Scl.ElementsOf> },
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const targetRecord = await query.getRecord(params.target)
	if (!targetRecord) return []

	if (isTypeIdTarget(targetRecord.tagName)) return findTypeIdReferrers(query, targetRecord)

	const uuidReferrers = await findUuidReferrers(query, targetRecord)
	if (targetRecord.tagName !== 'LN' && targetRecord.tagName !== 'LN0') return uuidReferrers

	const following = await findMappedDataFollowingLn(query, {
		ln: targetRecord as Scl.TrackedRecord<'LN' | 'LN0'>,
	})
	return [...uuidReferrers, ...following]
}

/**
 * Each referrer with its nearest ancestor of `containerTagName`, the ancestors of all referrers read in one
 * `findAncestorsOfEach` (one read per level), stopping at that tag.
 */
async function withContainers(
	query: Core.Query<Config>,
	params: {
		referrers: Scl.TrackedRecord<Scl.ElementsOf>[]
		containerTagName?: Scl.ElementsOf
	},
): Promise<ResolvedReference[]> {
	const { referrers, containerTagName } = params
	if (!containerTagName || referrers.length === 0) {
		return referrers.map(function withoutContainer(ref) {
			return { ref, container: undefined }
		})
	}
	const ancestries = await query.findAncestorsOfEach(referrers, { stopAtTagName: containerTagName })
	return referrers.map(function withContainer(ref, index) {
		const container = ancestries[index]?.find(function isContainer(ancestor) {
			return ancestor.tagName === containerTagName
		})
		return { ref, container }
	})
}

/** Referrers by a uuid attribute (uuid pairs and tuple references), matched on the target `uuid`. */
async function findUuidReferrers(
	query: Core.Query<Config>,
	targetRecord: Scl.TrackedRecord<Scl.ElementsOf>,
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const uuid = readAttribute({ record: targetRecord, name: 'uuid' })
	if (!uuid) return []

	const entries = UUID_REFERRERS_BY_TARGET.get(targetRecord.tagName) ?? []
	const results: Scl.TrackedRecord<Scl.ElementsOf>[] = []

	for (const entry of entries) {
		if (!isElementOf(entry.refTagName, SCL_DIALECTE_CONFIG)) continue

		const refRecords = await query.findByAttributes({
			tagName: entry.refTagName as Scl.ElementsOf,
			attributes: { [entry.uuidAttr]: uuid },
		})
		results.push(...refRecords)
	}

	return results
}

/** Referrers of a DataTypeTemplates type, matched on its `id` (type-id refs). */
async function findTypeIdReferrers(
	query: Core.Query<Config>,
	targetRecord: Scl.TrackedRecord<Scl.ElementsOf>,
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const id = readAttribute({ record: targetRecord, name: 'id' })
	if (!id) return []

	const referrers = TYPE_ID_REFERRERS_BY_TARGET.get(targetRecord.tagName as TypeIdTarget) ?? []
	const results: Scl.TrackedRecord<Scl.ElementsOf>[] = []

	for (const referrer of referrers) {
		if (!isElementOf(referrer.refTagName, SCL_DIALECTE_CONFIG)) continue

		const refRecords = await query.findByAttributes({
			tagName: referrer.refTagName as Scl.ElementsOf,
			attributes: { [referrer.attribute]: id },
		})
		for (const ref of refRecords) {
			if (matchesWhen({ ref, referrer })) results.push(ref)
		}
	}

	return results
}

/** Honour a referrer's optional discriminator (e.g. DA.bType === 'Enum'). */
function matchesWhen(params: {
	ref: Scl.TrackedRecord<Scl.ElementsOf>
	referrer: TypeIdReferrer
}): boolean {
	const { ref, referrer } = params
	if (!referrer.when) return true
	const value = readAttribute({ record: ref, name: referrer.when.attribute, defaults: 'none' })
	return value === referrer.when.equals
}
