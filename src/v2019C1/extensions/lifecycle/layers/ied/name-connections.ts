import { readAttributes } from '@/v2019C1/helpers'

import type { NameConnectionsParams } from './name-connections.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Write on each `ConnectedAP` the placement or the update added without `apUuid` the uuid of the placed access point it names. */
export async function bindConnections(
	tx: Core.Transaction<Config>,
	params: NameConnectionsParams,
): Promise<void> {
	const connections = params.cloneMappings.filter(
		(mapping) => mapping.target.tagName === 'ConnectedAP',
	)
	if (connections.length === 0) return
	const accessPoints = await tx.getChildren(params.ied, 'AccessPoint')
	const uuidByName = new Map<string, string>()
	for (const accessPoint of accessPoints) {
		const { name, uuid } = readAttributes({ record: accessPoint })
		if (name && uuid) uuidByName.set(name, uuid)
	}
	const records = await tx.getRecords(
		connections.map(({ target }) => target as Scl.Ref<'ConnectedAP'>),
	)
	for (const connection of records) {
		if (!connection) continue
		const { apName, apUuid } = readAttributes({ record: connection })
		const placedUuid = apName ? uuidByName.get(apName) : undefined
		if (apUuid || !placedUuid) continue
		await tx.update(
			{ tagName: 'ConnectedAP', id: connection.id },
			{ attributes: { apUuid: placedUuid } },
		)
	}
}

/** Write the placed IED's name on each `ConnectedAP` the placement or the update added. */
export async function nameConnections(
	tx: Core.Transaction<Config>,
	params: NameConnectionsParams,
): Promise<void> {
	const connections = params.cloneMappings.filter(
		(mapping) => mapping.target.tagName === 'ConnectedAP',
	)
	if (connections.length === 0) return
	const { name } = await tx.getAttributes(params.ied)
	for (const { target } of connections) {
		await tx.update(target as Scl.Ref<'ConnectedAP'>, { attributes: { iedName: name } })
	}
}
