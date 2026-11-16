import { cloneProcessSection, settleProcessSection } from './process-section'

import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { assertIedPlacementOffered } from '@/v2019C1/extensions/lifecycle/layers/ied/assert-ied-placement'
import { isIsdInstance } from '@/v2019C1/extensions/lifecycle/layers/ied/is-isd-instance'
import { placeIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/place-ied-communication'
import { resolveSsdScope } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'
import { readAttributes } from '@/v2019C1/helpers'

import type {
	CloneSpecificationParams,
	IedParams,
	IedResult,
	NameConnectionsParams,
	SettleIedParams,
} from './ied.types'
import type { ClonedProcessSection } from './process-section.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Place the IED of a source file (a template ISD, an ICD) in a project as a new IED, or the IED of an ISD instance file
 * (not named `SPECIFICATION`) as a fork, keeping its identity. An ISD instance placed otherwise, an IED `template` or
 * `fork` finds in the project, and a fork whose specification the project already holds part of by uuid, are refused
 * with `OPTION_NOT_AVAILABLE` before anything is written.
 *
 * Clones the IED under the project's root with its type closure (`transplant.deep`: the data types its logical nodes
 * use, reused when the project holds the same, kept apart under another id when one of its ids is taken), then writes
 * the identity the scenario places with: a new IED stamps lineage (each element records its source counterpart as its
 * `templateUuid`, a uuid of its own), its internal uuid references repointed; a fork keeps the file's uuids. Its access
 * points' `ConnectedAP`s land under the project's Communication (the source's copied when it has none): under the `SubNetwork` carrying
 * their subnetwork's uuid as lineage, else of its name, or under that subnetwork added. A name another IED holds is
 * numbered (the consumer's edited name first), and the `ConnectedAP`s name the IED as placed, each naming its access
 * point by uuid: one the source names by names only is given the placed access point's uuid. The IED records the
 * source file in its `IEDSourceFiles` (`reference.writeProvenance`, the `fileType` given), retaining what it listed:
 * when the scenario places a new IED, and for an ISD instance placed as a fork; nothing is recorded at the project's
 * header.
 *
 * The specification an ISD carries beside its IED (a substation section: its levels, the functions and their
 * LNodes) is placed with it as `instantiate.ssd` places a substation scope: each level where the consumer maps it, else
 * on the project's level of its kind when it holds one only, the unit level created under a free name (a `TEMPLATE`
 * bay is named for its kind); what the consumer left out is not placed. The IED and its specification take
 * their identity in one pass, so each LNode names the logical node of the IED placed with it; the commit then writes
 * its names and specifies it on that IED. Another file's substation section (an ICD's) is not placed.
 *
 * @intent place an IED from an ISD or ICD in a project, instantiate a template IED, add an IED from a file as a new IED, place an ISD with its specification (functions and LNodes) in a project, import an ISD instance keeping its identity
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
	// the specification the file carries beside its IED, placed with it
	const specification = await cloneSpecification(tx, { ...params, policy })
	const cloneMappings = [
		...iedMappings,
		...communication.cloneMappings,
		...(specification?.cloneMappings ?? []),
	]
	// one identity pass over all it placed: an LNode of the specification names the logical node placed with it
	await finalizeClonedIdentity(tx, {
		cloneMappings,
		mode: policy.placementIdentity,
		redirectMappings: [
			...communication.redirectMappings,
			...(specification?.redirectMappings ?? []),
		],
	})
	if (specification) {
		await settleProcessSection(tx, {
			sourceQuery,
			cloned: specification,
			targetParent: anchor,
			policy,
			overrides,
			decisionMappings: params.decisionMappings,
			cloneMappings,
		})
	}

	const placed = { tagName: 'IED', id: record.id } as const
	await settleIed(tx, { ...params, policy, placed, connections: communication.cloneMappings })
	return { iedRef: placed, cloneMappings }
}

/**
 * The IED placed, its identity final: its connections bound to its access points, its name made unique where it sits,
 * the connections naming it, the file it came from recorded.
 */
async function settleIed(tx: Core.Transaction<Config>, params: SettleIedParams): Promise<void> {
	const { sourceQuery, iedRef, anchor, fileType, overrides, policy, placed, connections } = params
	// a connection the source names by names only is given its access point's uuid before the IED is numbered: it then
	// belongs to the IED placed and follows its name, never to another IED of its name
	await bindConnections(tx, { ied: placed, cloneMappings: connections })
	if (policy.bumpsCollisions) {
		await placeUniquely(tx, {
			ref: placed,
			parentRef: anchor,
			overrides: overrides?.get(iedRef.id),
		})
	}
	// a connection names the IED by its name: one naming it by names only cannot follow it, it is written here
	await nameConnections(tx, { ied: placed, cloneMappings: connections })
	// an ISD instance, placed as a fork, records the ISD too: it is how its IED came into the project
	const iedName = await sourceQuery.getAttribute(iedRef, { name: 'name' })
	const isdInstance = isIsdInstance({ fileType, iedName })
	if (policy.writesProvenance || isdInstance) {
		await writeProvenance(tx, { sourceQuery, target: { anchor: 'ied', root: placed, fileType } })
	}
}

/**
 * The clone step of the specification an ISD carries beside its IED (its substation section, see `resolveSsdScope`);
 * `undefined` for another file, an ISD carrying none, or the consumer leaving it all out.
 */
async function cloneSpecification(
	tx: Core.Transaction<Config>,
	params: CloneSpecificationParams,
): Promise<ClonedProcessSection | undefined> {
	const { sourceQuery, anchor, policy } = params
	// an ISD carries the specification of its IED; another file's substation section is no part of the placement
	if (params.fileType !== 'ISD') return undefined
	const scope = await resolveSsdScope(sourceQuery, {})
	if (!scope) return undefined
	return cloneProcessSection(tx, {
		sourceQuery,
		scope,
		targetParent: anchor,
		policy,
		decisionMappings: params.decisionMappings,
		leftOut: params.leftOut,
		operation: 'instantiate (ied)',
	})
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
