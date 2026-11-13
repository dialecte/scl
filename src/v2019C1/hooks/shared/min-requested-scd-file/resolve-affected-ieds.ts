import {
	MIN_REQUESTED_SCD_CONNECTED_AP_TRIGGER_TAGS,
	MIN_REQUESTED_SCD_IED_TRIGGER_TAGS,
	MIN_REQUESTED_SCD_SUBNETWORK_TRIGGER_TAGS,
} from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The IEDs whose configuration changes when `record` is created, updated or deleted.
 *
 * IED content resolves to its `IED` ancestor. Communication content resolves through its `ConnectedAP`: the IED holding
 * the access point its `apUuid` names, else the IED its `iedName` names; a `SubNetwork` setting reaches every attached
 * IED, once each.
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
		if (tagName === 'P') {
			const ancestors = await query.findAncestors(record, { stopAtTagName: 'ConnectedAP' })
			if (ancestors.some((ancestor) => ancestor.tagName === 'PhysConn')) return []
		}
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
 * The `IED` named `iedName`, or `null` when none carries that name, or several do (a name two IEDs hold, as while an
 * IED placed beside one of its name is not numbered yet, names neither).
 *
 * @stopgap Finds the IED by the `iedName` string: what a `ConnectedAP` without `apUuid`, or a former name, gives.
 */
export async function resolveIedByName(
	query: Core.Query<Config>,
	params: { iedName: string | undefined },
): Promise<Scl.Ref<'IED'> | null> {
	const { iedName } = params
	if (!iedName) return null

	const ieds = await query.findByAttributes({ tagName: 'IED', attributes: { name: iedName } })
	const [ied] = ieds
	return ied && ieds.length === 1 ? { tagName: 'IED', id: ied.id } : null
}

/**
 * The IEDs the `ConnectedAP`s of a subnetwork belong to, once each (see {@link resolveConnectedApOwner}): the access
 * points and the IEDs of the document read once for the whole subnetwork.
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
	if (connectedAps.length === 0) return []
	const accessPoints = await query.getRecordsByTagName('AccessPoint')
	const iedIdByAccessPointUuid = new Map<string, string>()
	for (const accessPoint of accessPoints) {
		const uuid = readAttribute({
			record: accessPoint,
			name: 'uuid',
			defaults: 'none',
			fullObject: true,
		})?.value
		if (uuid && accessPoint.parent?.tagName === 'IED')
			iedIdByAccessPointUuid.set(uuid, accessPoint.parent.id)
	}
	const ieds = await query.getRecordsByTagName('IED')
	// a name two IEDs hold names neither
	const iedIdByName = new Map<string, string | undefined>()
	for (const ied of ieds) {
		const name = readAttribute({ record: ied, name: 'name' })
		if (name) iedIdByName.set(name, iedIdByName.has(name) ? undefined : ied.id)
	}

	const iedIds = new Set<string>()
	for (const connectedAp of connectedAps) {
		const apUuid = readAttribute({
			record: connectedAp,
			name: 'apUuid',
			defaults: 'none',
			fullObject: true,
		})?.value
		const iedName = readAttribute({ record: connectedAp, name: 'iedName' })
		const iedId = apUuid ? iedIdByAccessPointUuid.get(apUuid) : iedIdByName.get(iedName)
		if (iedId) iedIds.add(iedId)
	}
	return [...iedIds].map((id) => ({ tagName: 'IED' as const, id }))
}

/** The `IED` the `ConnectedAP` holding `record` (or `record` itself) belongs to: see {@link resolveConnectedApOwner}. */
async function resolveConnectedApIed(
	query: Core.Query<Config>,
	params: { record: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Ref<'IED'> | null> {
	const { record } = params

	const connectedApId = await findSelfOrAncestorId(query, { record, tagName: 'ConnectedAP' })
	if (!connectedApId) return null
	const connectedAp =
		record.tagName === 'ConnectedAP'
			? record
			: await query.getRecord({ tagName: 'ConnectedAP', id: connectedApId })
	return connectedAp ? resolveConnectedApOwner(query, { connectedAp }) : null
}

/**
 * The `IED` a `ConnectedAP` belongs to, read from the record as it is given (a former version of it included): the IED
 * holding the access point its `apUuid` names, as for every reference naming by uuid; `null` when that uuid names
 * nothing the document holds. A `ConnectedAP` without `apUuid` belongs to the IED its `iedName` names.
 */
export async function resolveConnectedApOwner(
	query: Core.Query<Config>,
	params: { connectedAp: Scl.RawRecord<Scl.ElementsOf> | Core.AnyTrackedRecord },
): Promise<Scl.Ref<'IED'> | null> {
	const { connectedAp } = params
	const apUuid = readAttribute({
		record: connectedAp,
		name: 'apUuid',
		defaults: 'none',
		fullObject: true,
	})?.value
	if (!apUuid) {
		return resolveIedByName(query, {
			iedName: readAttribute({ record: connectedAp, name: 'iedName' }),
		})
	}
	const [accessPoint] = await query.findByAttributes({
		tagName: 'AccessPoint',
		attributes: { uuid: apUuid },
	})
	return accessPoint?.parent?.tagName === 'IED'
		? { tagName: 'IED', id: accessPoint.parent.id }
		: null
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
