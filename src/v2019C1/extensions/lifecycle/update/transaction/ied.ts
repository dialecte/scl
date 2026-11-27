import { reconcileIedSpecification } from './ied-specification'

import { toRef } from '@dialecte/core/helpers'

import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	assertDecisionsCoherent,
	assertRequiredDecisionsTaken,
	collisionOverrides,
	firstTimeGroups,
	followsSource,
	groupsForInstance,
	reportInstanceById,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { withUpdateHolds } from '@/v2019C1/extensions/lifecycle/engine/reference-retargets'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { repointAddedReferences } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references'
import { ied as instantiateIed } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { readFileCommunications } from '@/v2019C1/extensions/lifecycle/layers/ied/file-communication'
import { readInstanceRedirects } from '@/v2019C1/extensions/lifecycle/layers/ied/instance-redirects'
import {
	bindConnections,
	nameConnections,
} from '@/v2019C1/extensions/lifecycle/layers/ied/name-connections'
import {
	clearLostSubscriptions,
	readSubscriptionsTo,
} from '@/v2019C1/extensions/lifecycle/layers/ied/other-ied-impacts'
import { placeIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/place-ied-communication'
import { readIedSpecification } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-specification'
import { resolveIedScenario } from '@/v2019C1/extensions/lifecycle/layers/ied/resolve-ied-instance'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type {
	ReconcileFileCommunicationParams,
	ReconcileIedParams,
	UpdateIedParams,
} from './ied.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { AppliedInstance } from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'

/**
 * Connect what the IED's access points gained under the project's subnetworks, as the template connects them: a
 * connection of an access point the IED holds lands on the project's, a subnetwork's own settings stay the project's;
 * what is added takes its identity, names the IED as the project names it and its access point by uuid. Returns the
 * clone mappings of what it added.
 */
async function connectAccessPoints(
	tx: Core.Transaction<Config>,
	params: ReconcileIedParams & { instanceRef: Scl.Ref<'IED'>; matchKey: MatchKey },
): Promise<Scl.CloneMapping[]> {
	const { instance, instanceRef, matchKey, policy } = params
	// what the IED holds now, the access points it gained included: a connection to one names it
	const redirectMappings = await readInstanceRedirects(tx, { instance, matchKey })
	const communication = await placeIedCommunication(tx, {
		sourceQuery: params.sourceQuery,
		iedRef: params.iedRef,
		anchor: params.anchor,
		matchKey,
		placeholderLineages: params.placeholderLineages,
		redirectMappings,
	})
	await finalizeClonedIdentity(tx, {
		cloneMappings: communication.cloneMappings,
		mode: policy.placementIdentity,
		redirectMappings: communication.redirectMappings,
	})
	await bindConnections(tx, { ied: instanceRef, cloneMappings: communication.cloneMappings })
	await nameConnections(tx, { ied: instanceRef, cloneMappings: communication.cloneMappings })
	return communication.cloneMappings
}

/**
 * The open ISD's Communication reconciled with the other version's, as the groups of its own report instance decide
 * (everything the other version brings without decisions): paired by uuid, names and values following, an element
 * only in the open ISD kept unless its removal is accepted. Returns the clone mappings of what it added.
 */
async function reconcileFileCommunication(
	tx: Core.Transaction<Config>,
	params: ReconcileFileCommunicationParams,
): Promise<Scl.CloneMapping[]> {
	const { communications, policy, report, decisions } = params
	const groups = groupsForInstance(report, communications.target.id ?? '')
	const { cloneMappings } = await reconcile(tx, {
		sourceQuery: params.sourceQuery,
		sourceRootRef: communications.source,
		instanceRootRef: communications.target,
		accepted: decisions ? acceptedRefIds({ groups, decisions }) : undefined,
		overrides: decisions ? collisionOverrides({ groups, decisions }) : undefined,
		matchKey: policy.matchKey,
		identityMode: policy.identityMode,
		bumpsCollisions: policy.bumpsCollisions,
		removalBase: params.removalBase,
		namesFollow: policy.namesFollow,
		placeholderLineages: params.placeholderLineages,
	})
	const reportInstance = reportInstanceById(report, communications.target.id ?? '')
	if (reportInstance) annotateInstance({ reportInstance, added: sourceToTargetMap(cloneMappings) })
	return cloneMappings
}

/**
 * The recipe of `tx.lifecycle.update.ied` (which then releases what it wrote, see `public-recipes.ts`): update the IED of
 * the project placed from a template ISD with a newer revision of it, the one `targetInstance` names (required when the
 * project holds several, `TARGET_INSTANCE_REQUIRED`), or place it when the project holds none (`instantiate.ied`); with
 * `scenario: 'fork'`, the IED of an open ISD with another version of the same file, its Communication and its
 * specification with it.
 * A placement follows `collisions` and reads the report's decisions for the IED's name only. Updating an IED the project
 * holds, given a report and decisions, writes what they accept (see `reconcileIed`), a group waiting for a decision left
 * out refused (`DECISION_REQUIRED`) before anything is written; without, everything the revision brings, a change to another
 * IED with its cleanup included: run `query.lifecycle.report` first to see and decide what would. The specification an
 * ISD carries beside the IED is updated with it.
 *
 * @intent update an S-IED from a newer revision of its template ISD, reconcile an IED with its template, update the specification of an S-IED (its functions and LNodes), update an open ISD from another version of it
 */
export async function ied(
	tx: Core.Transaction<Config>,
	params: UpdateIedParams,
): Promise<AppliedInstance<'IED'>[]> {
	const { sourceQuery, iedRef, anchor, fileType, scenario = 'template' } = params
	const policy = scenarioPolicy({ scenario })
	// the decision `query.lifecycle.scenarioOf` reads too: the IED updated, or a placement offered
	const instance = await resolveIedScenario(tx, {
		sourceQuery,
		iedRef,
		scenario,
		fileType,
		targetInstance: params.targetInstance,
		operation: 'apply (ied)',
	})
	if (!instance) {
		const placed = await instantiateIed(tx, {
			sourceQuery,
			iedRef,
			anchor,
			fileType,
			scenario,
			keepNameTypesFrom: params.keepNameTypesFrom,
			collisions: params.collisions,
			overrides: collisionOverrides({
				groups: firstTimeGroups(params.report, {}),
				decisions: params.decisions ?? new Map(),
			}),
		})
		return [{ ref: placed.iedRef, placement: 'placed' }]
	}
	// a group waiting for a decision is decided, and what the decisions accept holds together, before anything is written
	if (params.report && params.decisions) {
		const groups = allGroups(params.report)
		assertRequiredDecisionsTaken({ groups, decisions: params.decisions })
		assertDecisionsCoherent({ groups, decisions: params.decisions })
	}
	const removalBase = await resolveRemovalBase({ policy, sourceQuery })
	return reconcileIed(tx, {
		...params,
		instance,
		policy,
		removalBase,
		placeholderLineages: new Set(),
	})
}

/**
 * Write what a report lists for an IED of the project a newer revision of its template updates: its tree reconciled
 * with the template's as the IED's groups decide (a logical node gained added, one dropped removed, a type changed
 * followed, a value the project may set kept unless taken over), the references it gained repointed onto what the
 * project holds, the revision recorded in its `IEDSourceFiles` when anything the template brings is accepted. What its
 * access points gained connects under the project's subnetworks, naming the IED as the project names it; what the
 * project holds there is its own (a subnetwork's settings, an address). The IED keeps its project name and its
 * identity. In another IED it writes what an accepted group changes there, and clears the control block of each input
 * subscribed to data its entries no longer send (`clearLostSubscriptions`). The specification an ISD carries beside it
 * follows (`reconcileIedSpecification`): told by what binds to the IED before the update, updated as `update.ssd`
 * updates a substation scope, its gained `LNode`s bound to the IED as it then stands; placed when the project holds
 * none of it. The revision is recorded when anything of the file is accepted. Returns the IED, `reconciled`.
 */
export async function reconcileIed(
	tx: Core.Transaction<Config>,
	params: ReconcileIedParams,
): Promise<AppliedInstance<'IED'>[]> {
	const { sourceQuery, iedRef, instance, report, decisions, policy } = params
	const { matchKey, identityMode, bumpsCollisions, namesFollow } = policy
	const groups = groupsForInstance(report, instance.id)
	const instanceRef = toRef(instance) as Scl.Ref<'IED'>
	// the specification beside the IED, told by what binds to it before the update changes the IED
	const specification = await readIedSpecification(tx, {
		sourceQuery,
		fileType: params.fileType,
		iedRef: instanceRef,
		matchKey,
	})
	// what the update holds, read once, as the report read it: what of the specification it leaves out is not held
	const removalBase = await withUpdateHolds({
		removalBase: params.removalBase,
		sourceQuery,
		target: tx,
		leftOut: specification?.scope.leftOut,
	})
	// the inputs of other IEDs subscribed to what the IED's data sets send, read before the update changes them
	const before = await tx.any.getTree(instanceRef)
	const subscriptions = before ? await readSubscriptionsTo(tx, { instance: before }) : []

	const { cloneMappings } = await reconcile(tx, {
		sourceQuery,
		sourceRootRef: iedRef,
		instanceRootRef: instance,
		accepted: decisions ? acceptedRefIds({ groups, decisions }) : undefined,
		overrides: decisions ? collisionOverrides({ groups, decisions }) : undefined,
		keepNameTypesFrom: params.keepNameTypesFrom,
		matchKey,
		identityMode,
		bumpsCollisions,
		removalBase,
		namesFollow,
		placeholderLineages: params.placeholderLineages,
		takeOver: params.takeOver,
	})
	// a fork on an open ISD: the file's Communication follows the other version as its own groups decide; otherwise what
	// its access points gained connects to the project's subnetworks
	const fileCommunications = await readFileCommunications(tx, {
		sourceQuery,
		anchor: params.anchor,
		policy,
	})
	const connections = fileCommunications
		? await reconcileFileCommunication(tx, {
				...params,
				removalBase,
				communications: fileCommunications,
			})
		: await connectAccessPoints(tx, { ...params, instanceRef, matchKey })
	const added = [...cloneMappings, ...connections]
	// a reference the update added may name an element the IED already holds, or one it added: it names the project's
	await repointAddedReferences(tx, { cloneMappings: added, instanceRootRef: instance, matchKey })
	// an input of another IED whose entries all went no longer names their control block
	await clearLostSubscriptions(tx, { subscriptions, instanceRef })
	const reportInstance = reportInstanceById(report, instance.id)
	if (reportInstance) annotateInstance({ reportInstance, added: sourceToTargetMap(added) })
	// the specification follows, its LNodes bound to the IED as it now stands
	if (specification) {
		await reconcileIedSpecification(tx, { ...params, removalBase, instanceRef, specification })
	}

	// the IED now holds this revision of its template, when anything of the file is written (its specification
	// included): its own reference names it
	if (
		policy.writesProvenance &&
		followsSource({ groups: report ? allGroups(report) : groups, decisions })
	) {
		await writeProvenance(tx, {
			sourceQuery,
			target: { anchor: 'ied', root: instanceRef, fileType: params.fileType },
		})
	}
	return [{ ref: instanceRef, placement: 'reconciled' }]
}
