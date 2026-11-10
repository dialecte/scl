import { isNativeRecord } from './is-native-record'

import { toRef } from '@dialecte/core/helpers'

import { readAttributes } from '@/v2019C1/helpers'

import type { IedCommunicationDescription } from './read-ied-communication.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Discover the Communication slice by the complete IED/access-point name pair; vendor elements sharing those names stay opaque. */
export async function readIedCommunication(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'>; iedName: string },
): Promise<IedCommunicationDescription> {
	const { iedRef, iedName } = params
	const accessPoints = await query.getChildren(iedRef, 'AccessPoint')
	const accessPointAttributes = accessPoints.map((record) => readAttributes({ record }))
	const names = new Set(accessPointAttributes.map(({ name }) => name))
	const scope = new Set(accessPointAttributes.flatMap(({ uuid }) => (uuid ? [uuid] : [])))

	const allCommunications = await query.getRecordsByTagName('Communication')
	const communications = allCommunications.filter(isNativeRecord)
	const communicationIds = new Set(communications.map(({ id }) => id))
	const allNetworks = await query.getRecordsByTagName('SubNetwork')
	const networks = allNetworks.filter(
		(network) =>
			isNativeRecord(network) && network.parent && communicationIds.has(network.parent.id),
	)
	const networkIds = new Set(networks.map(({ id }) => id))
	const allConnections = await query.getRecordsByTagName('ConnectedAP')
	const connections = allConnections.filter(
		(connection) =>
			isNativeRecord(connection) && connection.parent && networkIds.has(connection.parent.id),
	)

	const connectedNetworks = new Set<string>()
	const leaveOut = new Set<string>()
	for (const connection of connections) {
		const attributes = readAttributes({ record: connection })
		if (attributes.iedName === iedName && names.has(attributes.apName)) {
			if (connection.parent) connectedNetworks.add(connection.parent.id)
		} else {
			leaveOut.add(connection.id)
		}
	}
	const connectedCommunications = new Set<string>()
	for (const network of networks) {
		if (!connectedNetworks.has(network.id)) leaveOut.add(network.id)
		else if (network.parent) connectedCommunications.add(network.parent.id)
	}
	const satelliteRefs = communications
		.filter((communication) => connectedCommunications.has(communication.id))
		.map((communication) => toRef(communication))
	return { satelliteRefs, scope, leaveOut }
}
