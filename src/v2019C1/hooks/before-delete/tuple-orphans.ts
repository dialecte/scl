import {
	DELETED_TUPLE_REFERRER_TAGS,
	SUBSCRIBED_ACCESS_POINT_TAG,
	SUBSCRIBED_DEVICE_TAG,
	SUBSCRIBER_DEVICE_PART_ATTRIBUTES_BY_TAG,
	SUBSCRIBER_NODE_PART_ATTRIBUTES_BY_TAG,
	TUPLE_ORPHAN_TAGS,
} from './orphaned-refs.constants'

import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { readAttribute } from '@/v2019C1/helpers'
import { namesControlBlock } from '@/v2019C1/hooks/shared/control-block-reference'
import { inputSourceEffect } from '@/v2019C1/hooks/shared/input-source'

import type { DeletedSubtree, OrphanedRef } from './orphaned-refs.types'
import type { Scl } from '@/v2019C1/config'
import type { ReferenceUuid } from '@/v2019C1/extensions/reference/constants/reference-uuids.types'

/** The tuple referrer tags a delete can reach: those with a reference to a tag the deleted records carry a uuid on. */
export function tupleReferrerTagsReached(params: { subtree: DeletedSubtree }): Scl.ElementsOf[] {
	const { uuidTags } = params.subtree
	return TUPLE_ORPHAN_TAGS.filter((tagName) =>
		(REFERENCE_UUIDS_BY_TAG.get(tagName) ?? []).some((reference) =>
			reference.target.some((target) => uuidTags.has(target)),
		),
	)
}

/**
 * A tuple referrer naming, by one of its uuids, an element of the deleted subtrees, with what the delete does to it. A
 * referrer naming them by names only, with no uuid, is left.
 * - One with no identity of its own is deleted; but a subscriber ({@link subscriberOrphanOf}).
 * - An input or output (`ExtRef`, `ExtCtrl`) is kept with its internal address, its whole source cleared; only the
 *   control block when only that goes. With no internal address and its whole source going, it holds nothing of its
 *   own: deleted.
 */
export function tupleOrphanOf(params: {
	refRecord: Scl.TrackedRecord<Scl.ElementsOf>
	subtree: DeletedSubtree
}): OrphanedRef | undefined {
	const { refRecord, subtree } = params
	const named = (REFERENCE_UUIDS_BY_TAG.get(refRecord.tagName) ?? []).filter((reference) => {
		if (reference.form !== 'tuple' || reference.followsOnly) return false
		const uuid = readAttribute({ record: refRecord, name: reference.uuid, defaults: 'none' })
		return Boolean(uuid) && subtree.byUuid.has(uuid)
	})
	if (named.length === 0) return undefined
	const cause = causeOf({ refRecord, named, subtree })
	if (DELETED_TUPLE_REFERRER_TAGS.has(refRecord.tagName))
		return { ...subscriberOrphanOf({ refRecord, named, subtree }), ...cause }
	const scope = named.every(namesControlBlock) ? 'control-block' : 'data'
	const result = inputSourceEffect({ record: refRecord, scope })
	if (result.effect === 'deleted')
		return { record: refRecord, effect: 'deleted', attributes: new Set(), ...cause }
	return result.attributes.length > 0
		? { record: refRecord, effect: 'cleared', attributes: new Set(result.attributes), ...cause }
		: undefined
}

/** The first record of the deleted subtrees a referrer names by one of its uuids: why it goes. */
function causeOf(params: {
	refRecord: Scl.TrackedRecord<Scl.ElementsOf>
	named: readonly ReferenceUuid[]
	subtree: DeletedSubtree
}): { cause?: string } {
	const { refRecord, named, subtree } = params
	for (const reference of named) {
		const uuid = readAttribute({ record: refRecord, name: reference.uuid, defaults: 'none' })
		const target = uuid ? subtree.byUuid.get(uuid) : undefined
		if (target) return { cause: target.id }
	}
	return {}
}

/**
 * A referrer with no identity of its own naming deleted elements: deleted, but a subscriber (`IEDName`) naming a part
 * of an IED whose access point stays: its subscription kept at the widest part still there. Its access point gone
 * (named by a deleted uuid, or holding a part named), or its whole IED, it is deleted; a device gone (named, or holding
 * the logical node named) clears the device and node parts, the IED's subscription kept; a logical node gone, its
 * device staying, clears the node parts, the device's kept.
 */
function subscriberOrphanOf(params: {
	refRecord: Scl.TrackedRecord<Scl.ElementsOf>
	named: readonly ReferenceUuid[]
	subtree: DeletedSubtree
}): OrphanedRef {
	const { refRecord, named, subtree } = params
	const deleted: OrphanedRef = { record: refRecord, effect: 'deleted', attributes: new Set() }
	const deviceParts = SUBSCRIBER_DEVICE_PART_ATTRIBUTES_BY_TAG.get(refRecord.tagName)
	const nodeParts = SUBSCRIBER_NODE_PART_ATTRIBUTES_BY_TAG.get(refRecord.tagName)
	if (!deviceParts || !nodeParts) return deleted
	if (subtree.iedNames.has(refRecord.value.trim())) return deleted
	const gone = new Set(
		named.flatMap((reference) => {
			const uuid = readAttribute({ record: refRecord, name: reference.uuid, defaults: 'none' })
			const target = subtree.byUuid.get(uuid)
			return target ? deletedAncestryTags({ record: target, subtree }) : []
		}),
	)
	if (gone.has(SUBSCRIBED_ACCESS_POINT_TAG)) return deleted
	return {
		record: refRecord,
		effect: 'cleared',
		attributes: new Set(gone.has(SUBSCRIBED_DEVICE_TAG) ? deviceParts : nodeParts),
	}
}

/**
 * The tags of a deleted record and of the records above it the delete removes too, read from the deleted records held
 * (no read): a logical node's device, server and access point when they go with it.
 */
function deletedAncestryTags(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	subtree: DeletedSubtree
}): string[] {
	const { record, subtree } = params
	const parent = record.parent ? subtree.byId.get(record.parent.id) : undefined
	return [record.tagName, ...(parent ? deletedAncestryTags({ record: parent, subtree }) : [])]
}
