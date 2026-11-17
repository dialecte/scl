import {
	BARE_TUPLE_REFERRER_TAGS,
	CONTENT_HOLDING_TUPLE_REFERRER_TAGS,
	REFERENCE_UUIDS_BY_TAG,
} from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { SOURCED_REFERRER_TAGS } from '@/v2019C1/hooks/shared/input-source.constants'

import type { Scl } from '@/v2019C1/config'
import type { ReferenceUuid } from '@/v2019C1/extensions/reference/constants/reference-uuids.types'

/** The perf span (`dev.perf`) around what a delete does beyond the deleted subtree. */
export const CASCADE_PERF_SPAN = 'scl::beforeDelete::cascade'

/**
 * The tuple referrers (`TUPLE_REFERENCE_PAIRS`) with no identity of their own: the bare ones (`FCDA`, `ClientLN`,
 * `IEDName`, `Association`, `KDC`, `ServerAt`) and those holding an address (`ConnectedAP`, `GSE`, `SMV`, their address
 * data going with them). Deleted when what their uuid names goes, but a subscriber naming a part of an IED
 * ({@link SUBSCRIBER_DEVICE_PART_ATTRIBUTES_BY_TAG}). An `FCDA` going raises the configuration revision of the control blocks
 * sending its data set; a `ClientLN` going leaves the other clients in their order.
 */
export const DELETED_TUPLE_REFERRER_TAGS: ReadonlySet<string> = new Set([
	...BARE_TUPLE_REFERRER_TAGS,
	...CONTENT_HOLDING_TUPLE_REFERRER_TAGS,
])

/** The target of a subscriber naming a whole IED's access point: its going ends the subscription. */
export const SUBSCRIBED_ACCESS_POINT_TAG = 'AccessPoint'

/** The target of a subscriber naming a logical device of an IED. */
export const SUBSCRIBED_DEVICE_TAG = 'LDevice'

/**
 * Per subscriber that may name a part of an IED below its access point (an `IEDName` naming a logical device or a
 * logical node): the attributes naming a logical device and what is in it, those it does not share with the access
 * point. Cleared when the device goes, the subscription of the IED kept.
 */
export const SUBSCRIBER_DEVICE_PART_ATTRIBUTES_BY_TAG: ReadonlyMap<string, readonly string[]> =
	subscriberParts({ wider: [SUBSCRIBED_ACCESS_POINT_TAG] })

/**
 * Per subscriber that may name a logical node of an IED: the attributes naming the logical node only, those it does
 * not share with its device or access point. Cleared when the logical node goes and its device stays, the
 * subscription of the device kept.
 */
export const SUBSCRIBER_NODE_PART_ATTRIBUTES_BY_TAG: ReadonlyMap<string, readonly string[]> =
	subscriberParts({ wider: [SUBSCRIBED_ACCESS_POINT_TAG, SUBSCRIBED_DEVICE_TAG] })

/**
 * Per deleted tuple referrer naming an access point and parts below it: the attributes of the parts below the `wider`
 * targets, those the references to the `wider` targets do not hold.
 */
function subscriberParts(params: { wider: readonly string[] }): Map<string, readonly string[]> {
	const { wider } = params
	return new Map(
		[...DELETED_TUPLE_REFERRER_TAGS].flatMap((tagName): [string, readonly string[]][] => {
			const references = (REFERENCE_UUIDS_BY_TAG.get(tagName) ?? []).filter(
				(reference) => reference.form === 'tuple',
			)
			const ofAccessPoint = references.filter((reference) =>
				reference.target.includes(SUBSCRIBED_ACCESS_POINT_TAG),
			)
			const ofParts = references.filter((reference) => !namesWider({ reference, wider }))
			if (ofAccessPoint.length === 0 || ofParts.length === 0) return []
			const shared = new Set(
				references
					.filter((reference) => namesWider({ reference, wider }))
					.flatMap((reference) => [reference.uuid, ...reference.names]),
			)
			const parts = [
				...new Set(ofParts.flatMap((reference) => [reference.uuid, ...reference.names])),
			].filter((name) => !shared.has(name))
			return [[tagName, parts]]
		}),
	)
}

/** The tuple referrers a delete reaches: those deleted, the sourced ones (an input, an output) cleared. */
export const TUPLE_ORPHAN_TAGS = [
	...DELETED_TUPLE_REFERRER_TAGS,
	...SOURCED_REFERRER_TAGS,
] as readonly Scl.ElementsOf[]

/** The entry of a data set: its going changes what the data set's control blocks send. */
export const DATA_SET_ENTRY_TAG = 'FCDA'

/** The data set a control block sends by its name (`datSet`). */
export const DATA_SET_TAG = 'DataSet'

/** Whether a reference names one of the `wider` targets. */
function namesWider(params: { reference: ReferenceUuid; wider: readonly string[] }): boolean {
	const { reference, wider } = params
	return reference.target.some((target) => wider.includes(target))
}
