import { toRef } from '@dialecte/core/helpers'

import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'
import { readAttributes } from '@/v2019C1/helpers'

import type {
	CarriedCommunication,
	ReadCarriedCommunicationParams,
} from './read-carried-communication.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The communication of several IEDs carried together: each connection names its IED and access point, and is kept when
 * that pair is a carried IED's; a subnetwork is kept when it holds a kept connection, a Communication section when it
 * holds a kept subnetwork (one subnetwork per source subnetwork, its connections of every carried IED together). With
 * `addresses: 'drop'`, the `Address` of each kept connection and of its GSE and SMV is left out and listed. The
 * elements are read by tag, whatever the number of IEDs; vendor payload sharing those names stays opaque.
 */
export async function readCarriedCommunication(
	query: Core.Query<Config>,
	params: ReadCarriedCommunicationParams,
): Promise<CarriedCommunication> {
	const { ieds, addresses } = params
	const accessPointsOfEach = await query.getChildrenOfEach(
		ieds.map(({ ied }) => ied),
		{ tagName: 'AccessPoint' },
	)
	const carriedPairs = new Set(
		ieds.flatMap(function pairsOf({ name }, position) {
			return accessPointsOfEach[position].map(
				(accessPoint) => `${name}\u0000${readAttributes({ record: accessPoint }).name}`,
			)
		}),
	)

	const communications = (await query.getRecordsByTagName('Communication')).filter(isNativeRecord)
	const communicationIds = new Set(communications.map(({ id }) => id))
	const networks = (await query.getRecordsByTagName('SubNetwork')).filter(
		function isOwnNetwork(network) {
			return (
				isNativeRecord(network) &&
				Boolean(network.parent && communicationIds.has(network.parent.id))
			)
		},
	)
	const networkIds = new Set(networks.map(({ id }) => id))
	const connections = (await query.getRecordsByTagName('ConnectedAP')).filter(
		function isOwnConnection(connection) {
			return (
				isNativeRecord(connection) &&
				Boolean(connection.parent && networkIds.has(connection.parent.id))
			)
		},
	)

	const kept = connections.filter(function isCarried(connection) {
		const { iedName, apName } = readAttributes({ record: connection })
		return carriedPairs.has(`${iedName}\u0000${apName}`)
	})
	const keptIds = new Set(kept.map(({ id }) => id))
	const keptNetworkIds = new Set(
		kept.flatMap((connection) => (connection.parent ? [connection.parent.id] : [])),
	)
	const keptCommunicationIds = new Set(
		networks.flatMap((network) =>
			keptNetworkIds.has(network.id) && network.parent ? [network.parent.id] : [],
		),
	)
	const leaveOut = new Set([
		...connections.flatMap(({ id }) => (keptIds.has(id) ? [] : [id])),
		...networks.flatMap(({ id }) => (keptNetworkIds.has(id) ? [] : [id])),
	])
	const dropped = addresses === 'drop' ? await readDroppedAddresses(query, { keptIds }) : []
	for (const { address } of dropped) leaveOut.add(address)
	return {
		communicationRefs: communications
			.filter((communication) => keptCommunicationIds.has(communication.id))
			.map((communication) => toRef(communication) as Scl.Ref<'Communication'>),
		leaveOut,
		warnings: dropped.map(({ holder }) => ({ code: 'address-not-carried', source: holder })),
	}
}

/** The `Address` of each kept connection and of the GSE and SMV it holds, with what holds it. */
async function readDroppedAddresses(
	query: Core.Query<Config>,
	params: { keptIds: ReadonlySet<string> },
): Promise<{ address: string; holder: Scl.Ref<'ConnectedAP' | 'GSE' | 'SMV'> }[]> {
	const { keptIds } = params
	const holders = new Map<string, Scl.Ref<'ConnectedAP' | 'GSE' | 'SMV'>>()
	for (const id of keptIds) holders.set(id, { tagName: 'ConnectedAP', id })
	const gses = await query.getRecordsByTagName('GSE')
	const smvs = await query.getRecordsByTagName('SMV')
	for (const record of [...gses, ...smvs]) {
		if (record.parent && keptIds.has(record.parent.id))
			holders.set(record.id, { tagName: record.tagName, id: record.id })
	}
	const addresses = (await query.getRecordsByTagName('Address')).filter(isNativeRecord)
	return addresses.flatMap(function droppedOf(address) {
		const holder = address.parent && holders.get(address.parent.id)
		return holder ? [{ address: address.id, holder }] : []
	})
}
