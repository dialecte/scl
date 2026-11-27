import { cloneProcessSection, settleProcessSection } from './process-section'

import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { REAL_DEVICE_FILE_TYPES } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.constants'
import { assertIedPlacementOffered } from '@/v2019C1/extensions/lifecycle/layers/ied/assert-ied-placement'
import {
	assertPlacedIedName,
	readPlacedIedName,
	resolveIedCollisions,
} from '@/v2019C1/extensions/lifecycle/layers/ied/ied-name-collision'
import { isIsdInstance } from '@/v2019C1/extensions/lifecycle/layers/ied/is-isd-instance'
import {
	bindConnections,
	nameConnections,
} from '@/v2019C1/extensions/lifecycle/layers/ied/name-connections'
import { fillOriginalEdition } from '@/v2019C1/extensions/lifecycle/layers/ied/original-edition'
import { placeIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/place-ied-communication'
import { resolveSsdScope } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { CloneSpecificationParams, IedParams, IedResult, SettleIedParams } from './ied.types'
import type { ClonedProcessSection } from './process-section.types'
import type { Config } from '@/v2019C1/config'
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
 * their subnetwork's uuid as lineage, else of its name, or under that subnetwork added whole; a subnetwork the project
 * holds keeps its own settings, the IED adds its connections only. A name another IED holds is numbered (the consumer's
 * edited name first) by `collisions: 'number'`, the default of a placement stamping the template's identity, or refused
 * with `IED_NAME_TAKEN` before anything is written by `collisions: 'refuse'`, the default of a fork, and the `ConnectedAP`s name the IED as placed, each naming its access
 * point by uuid: one the source names by names only is given the placed access point's uuid. The IED records the
 * source file in its `IEDSourceFiles` (`reference.writeProvenance`, the `fileType` given), retaining what it listed:
 * when the scenario places a new IED, for an ISD instance placed as a fork, and for a device file (an ICD) whatever the
 * scenario; nothing is recorded at the project's
 * header. An IED placed from a device file (an ICD) stating no original edition takes the edition of its file.
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
	const { sourceQuery, iedRef, fileType } = params
	const scenario = params.scenario ?? 'instantiate'
	// what is not placed yet is refused before anything is written: an ISD instance, an IED the project holds
	await assertIedPlacementOffered(tx, {
		sourceQuery,
		iedRef,
		scenario,
		fileType,
		operation: 'instantiate (ied)',
	})
	return placeIed(tx, { ...params, scenario })
}

/**
 * Place the IED of a source file under the project's root with what travels with it (its type closure, its
 * connections, the specification an ISD carries), with the identity and naming of the scenario's policy, whatever the
 * file type: the placement `ied` makes once it has checked the file type and what the project holds, and the one a
 * larger placement (several IEDs under one policy) repeats per IED. A name the project holds is refused before anything
 * is written when `collisions` asks it.
 */
export async function placeIed(
	tx: Core.Transaction<Config>,
	params: IedParams,
): Promise<IedResult> {
	const { sourceQuery, iedRef, anchor, overrides, keepNameTypesFrom } = params
	const scenario = params.scenario ?? 'instantiate'
	const policy = scenarioPolicy({ scenario })
	// a name the project holds is refused before anything is written when the placement asks for one
	await assertPlacedNameAllowed(tx, { ...params, policy })

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
 * Refuse, before anything is written, a name the IED cannot be placed under: one the consumer chose that is no IED name,
 * and, when the placement refuses a taken name (`collisions`), `TEMPLATE` or a name the project holds.
 */
async function assertPlacedNameAllowed(
	tx: Core.Transaction<Config>,
	params: CloneSpecificationParams,
): Promise<void> {
	const { sourceQuery, iedRef, anchor, overrides, policy } = params
	const collisions = resolveIedCollisions({
		collisions: params.collisions,
		placementIdentity: policy.placementIdentity,
	})
	const chosen = overrides?.get(iedRef.id)?.name
	const name = await readPlacedIedName({ sourceQuery, iedRef, chosen })
	await assertPlacedIedName(tx, { anchor, name, chosen: Boolean(chosen), collisions })
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
	// a device file's IED keeps the edition it was generated in
	await fillOriginalEdition(tx, { sourceQuery, placed, fileType })
	// an ISD instance, placed as a fork, records the ISD too: it is how its IED came into the project
	const iedName = await sourceQuery.getAttribute(iedRef, { name: 'name' })
	const isdInstance = isIsdInstance({ fileType, iedName })
	// a device file (an ICD, an IID) is recorded whatever the identity placed with: it tells a real device
	if (policy.writesProvenance || isdInstance || REAL_DEVICE_FILE_TYPES.has(fileType)) {
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
