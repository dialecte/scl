import { toRef } from '@dialecte/core/helpers'

import type { IedCommunicationDescription } from './read-ied-communication.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Discover the Communication slice by the complete IED/access-point name pair. */
export async function readIedCommunication(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'>; iedName: string },
): Promise<IedCommunicationDescription> {
	const { iedRef, iedName } = params
	const accessPoints = await query.getChildren(iedRef, 'AccessPoint')
	const names = new Set<string>()
	const scope = new Set<string>()
	for (const accessPoint of accessPoints) {
		const { name, uuid } = await query.getAttributes(accessPoint)
		names.add(name)
		if (uuid) scope.add(uuid)
	}
	const leaveOut = new Set<string>()
	const satelliteRefs: Scl.Ref<'Communication'>[] = []
	const communications = await query.getRecordsByTagName('Communication')
	for (const communication of communications) {
		let hasConnection = false
		const networks = await query.getChildren(communication, 'SubNetwork')
		for (const network of networks) {
			let hasNetworkConnection = false
			const connections = await query.getChildren(network, 'ConnectedAP')
			for (const connection of connections) {
				const attributes = await query.getAttributes(connection)
				if (attributes.iedName === iedName && names.has(attributes.apName)) {
					hasNetworkConnection = true
					hasConnection = true
				} else {
					leaveOut.add(connection.id)
				}
			}
			if (!hasNetworkConnection) leaveOut.add(network.id)
		}
		if (hasConnection) satelliteRefs.push(toRef(communication))
	}
	return { satelliteRefs, scope, leaveOut }
}
