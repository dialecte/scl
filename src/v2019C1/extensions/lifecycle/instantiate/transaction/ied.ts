import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { assertIedPlacementOffered } from '@/v2019C1/extensions/lifecycle/layers/ied/assert-ied-placement'
import { placeIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/place-ied-communication'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'
import { readAttributes } from '@/v2019C1/helpers'

import type { IedParams, IedResult, NameConnectionsParams } from './ied.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Place the IED of a source file (a template ISD, an ICD) in a project as a new IED. The IED of an ISD instance file
 * (not named `SPECIFICATION`), and one `template` or `fork` finds in the project, are refused with
 * `OPTION_NOT_AVAILABLE` before anything is written.
 *
 * Clones the IED under the project's root with its type closure (`transplant.deep`: the data types its logical nodes
 * use, reused when the project holds the same, kept apart under another id when one of its ids is taken), then writes
 * the identity the scenario places with: a new IED stamps lineage (each element records its source counterpart as its
 * `templateUuid`, a uuid of its own), its internal uuid references repointed; a fork keeps the file's uuids. Its access
 * points' `ConnectedAP`s land under the project's Communication (the source's copied when it has none): under the `SubNetwork` carrying
 * their subnetwork's uuid as lineage, else of its name, or under that subnetwork added. A name another IED holds is
 * numbered (the consumer's edited name first), and the `ConnectedAP`s name the IED as placed, each naming its access
 * point by uuid: one the source names by names only is given the placed access point's uuid. The IED records the
 * source file in its `IEDSourceFiles` (`reference.writeProvenance`, the `fileType` given), retaining what it listed.
 *
 * @intent place an IED from an ISD or ICD in a project, instantiate a template IED, add an IED from a file as a new IED
 */
export async function ied(tx: Core.Transaction<Config>, params: IedParams): Promise<IedResult> {
	const { sourceQuery, iedRef, anchor, fileType, overrides, keepNameTypesFrom } = params
	const scenario = params.scenario ?? 'instantiate'
	// what is not placed yet is refused before anything is written: an ISD instance, an IED the project holds
	await assertIedPlacementOffered(tx, {
		sourceQuery,
		iedRef,
		scenario,
		fileType,
		operation: 'instantiate (ied)',
	})
	const policy = scenarioPolicy({ scenario })

	const { record, cloneMappings: iedMappings } = await deep(tx, {
		sourceQuery,
		ref: iedRef,
		targetParent: anchor,
		withTypes: { keepNameFrom: keepNameTypesFrom },
	})
	// its access points' connections, under the project's subnetworks
	const communication = await placeIedCommunication(tx, {
		sourceQuery,
		iedRef,
		anchor,
		matchKey: policy.matchKey,
		placeholderLineages: params.placeholderLineages,
	})
	const cloneMappings = [...iedMappings, ...communication.cloneMappings]
	await finalizeClonedIdentity(tx, {
		cloneMappings,
		mode: policy.placementIdentity,
		redirectMappings: communication.redirectMappings,
	})

	const placed = { tagName: 'IED', id: record.id } as const
	// a connection the source names by names only is given its access point's uuid before the IED is numbered: it then
	// belongs to the IED placed and follows its name, never to another IED of its name
	await bindConnections(tx, { ied: placed, cloneMappings: communication.cloneMappings })
	if (policy.bumpsCollisions) {
		await placeUniquely(tx, {
			ref: placed,
			parentRef: anchor,
			overrides: overrides?.get(iedRef.id),
		})
	}
	// a connection names the IED by its name: one naming it by names only cannot follow it, it is written here
	await nameConnections(tx, { ied: placed, cloneMappings: communication.cloneMappings })
	if (policy.writesProvenance) {
		await writeProvenance(tx, { sourceQuery, target: { anchor: 'ied', root: placed, fileType } })
	}
	return { iedRef: placed, cloneMappings }
}

/** Write on each `ConnectedAP` the placement added without `apUuid` the uuid of the placed access point it names. */
async function bindConnections(
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

/** Write the placed IED's name on each `ConnectedAP` the placement added. */
async function nameConnections(
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
