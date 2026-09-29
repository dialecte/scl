import {
	MIN_REQUESTED_SCD_CONNECTED_AP_TRIGGER_TAGS,
	MIN_REQUESTED_SCD_IED_TRIGGER_TAGS,
	MIN_REQUESTED_SCD_SUBNETWORK_TRIGGER_TAGS,
} from '@/v2019C1/constants'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The IEDs whose configuration changes when `record` is created, updated or deleted.
 *
 * IED content resolves to its `IED` ancestor. Communication content resolves through
 * `ConnectedAP@iedName`; a `SubNetwork` setting reaches every attached IED, once each.
 */
export async function resolveAffectedIeds(
	query: Core.Query<Config>,
	params: { record: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Ref<'IED'>[]> {
	const { record } = params
	const tagName: string = record.tagName

	if (MIN_REQUESTED_SCD_SUBNETWORK_TRIGGER_TAGS.has(tagName)) {
		const subNetworkId = await findSelfOrAncestorId(query, { record, tagName: 'SubNetwork' })
		return subNetworkId ? resolveSubNetworkIeds(query, { subNetworkId }) : []
	}

	if (MIN_REQUESTED_SCD_CONNECTED_AP_TRIGGER_TAGS.has(tagName)) {
		const ied = await resolveConnectedApIed(query, { record })
		return ied ? [ied] : []
	}

	if (MIN_REQUESTED_SCD_IED_TRIGGER_TAGS.has(tagName)) {
		const ied = await resolveAncestorIed(query, { record })
		return ied ? [ied] : []
	}

	return []
}

/** The `IED` holding `record`, or `null` outside any IED. */
export async function resolveAncestorIed(
	query: Core.Query<Config>,
	params: { record: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Ref<'IED'> | null> {
	const { record } = params

	const ancestors = await query.findAncestors(record, { stopAtTagName: 'IED' })
	const ied = ancestors.find((ancestor) => ancestor.tagName === 'IED')
	return ied ? { tagName: 'IED', id: ied.id } : null
}

/**
 * The `IED` named `iedName`, or `null` when none carries that name.
 *
 * @stopgap Finds the IED by the `iedName` string. Remove once `ConnectedAP` resolves its
 * `AccessPoint` by uuid through the reference registry: resolve through that reference instead.
 */
export async function resolveIedByName(
	query: Core.Query<Config>,
	params: { iedName: string | undefined },
): Promise<Scl.Ref<'IED'> | null> {
	const { iedName } = params
	if (!iedName) return null

	const [ied] = await query.findByAttributes({ tagName: 'IED', attributes: { name: iedName } })
	return ied ? { tagName: 'IED', id: ied.id } : null
}

/**
 * @stopgap Reads each `ConnectedAP@iedName` string. Switch to the uuid reference together with
 * {@link resolveIedByName}.
 */
async function resolveSubNetworkIeds(
	query: Core.Query<Config>,
	params: { subNetworkId: string },
): Promise<Scl.Ref<'IED'>[]> {
	const { subNetworkId } = params

	const connectedAps = await query.getChildren(
		{ tagName: 'SubNetwork', id: subNetworkId },
		'ConnectedAP',
	)
	const iedsById = new Map<string, Scl.Ref<'IED'>>()
	for (const connectedAp of connectedAps) {
		const iedName = await query.getAttribute(connectedAp, { name: 'iedName' })
		const ied = await resolveIedByName(query, { iedName })
		if (ied) iedsById.set(ied.id, ied)
	}
	return [...iedsById.values()]
}

/**
 * @stopgap Reads the `ConnectedAP@iedName` string. Switch to the uuid reference together with
 * {@link resolveIedByName}.
 */
async function resolveConnectedApIed(
	query: Core.Query<Config>,
	params: { record: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Ref<'IED'> | null> {
	const { record } = params

	const connectedApId = await findSelfOrAncestorId(query, { record, tagName: 'ConnectedAP' })
	if (!connectedApId) return null

	const iedName = await query.getAttribute(
		{ tagName: 'ConnectedAP', id: connectedApId },
		{ name: 'iedName' },
	)
	return resolveIedByName(query, { iedName })
}

/** Id of `record` itself or of its closest ancestor tagged `tagName`. */
async function findSelfOrAncestorId(
	query: Core.Query<Config>,
	params: { record: Scl.RawRecord<Scl.ElementsOf>; tagName: 'ConnectedAP' | 'SubNetwork' },
): Promise<string | undefined> {
	const { record, tagName } = params
	if (record.tagName === tagName) return record.id

	const ancestors = await query.findAncestors(record, { stopAtTagName: tagName })
	return ancestors.find((ancestor) => ancestor.tagName === tagName)?.id
}
