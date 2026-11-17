import { toRef } from '@dialecte/core/helpers'

import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	collisionOverrides,
	followsSource,
	groupsForInstance,
	reportInstanceById,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { repointAddedReferences } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references'
import { ied as instantiateIed } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { readInstanceRedirects } from '@/v2019C1/extensions/lifecycle/layers/ied/instance-redirects'
import {
	bindConnections,
	nameConnections,
} from '@/v2019C1/extensions/lifecycle/layers/ied/name-connections'
import {
	assertNoBlockedGroupAccepted,
	assertWritesInsideIed,
} from '@/v2019C1/extensions/lifecycle/layers/ied/other-ied-impacts'
import { placeIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/place-ied-communication'
import { resolveIedInstance } from '@/v2019C1/extensions/lifecycle/layers/ied/resolve-ied-instance'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { ReconcileIedParams, UpdateIedParams } from './ied.types'
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
	const { instance, instanceRef, matchKey } = params
	// what the IED holds now, the access points it gained included: a connection to one names it
	const redirectMappings = await readInstanceRedirects(tx, { instance, matchKey })
	const communication = await placeIedCommunication(tx, {
		sourceQuery: params.sourceQuery,
		iedRef: params.iedRef,
		anchor: params.anchor,
		matchKey,
		placeholderLineages: params.placeholderLineages,
		redirectMappings,
		keepsSubNetworkSettings: true,
	})
	await finalizeClonedIdentity(tx, {
		cloneMappings: communication.cloneMappings,
		mode: scenarioPolicy({ scenario: 'template' }).placementIdentity,
		redirectMappings: communication.redirectMappings,
	})
	await bindConnections(tx, { ied: instanceRef, cloneMappings: communication.cloneMappings })
	await nameConnections(tx, { ied: instanceRef, cloneMappings: communication.cloneMappings })
	return communication.cloneMappings
}

/**
 * The recipe of `tx.lifecycle.update.ied` (which then releases what it wrote, see `public-recipes.ts`): update the IED of
 * the project placed from a template ISD with a newer revision of it, the one `targetInstance` names (required when the
 * project holds several, `TARGET_INSTANCE_REQUIRED`), or place it when the project holds none (`instantiate.ied`).
 * Given a report and decisions, writes what they accept (see `reconcileIed`), a group the report blocks accepted refused
 * with `UPDATE_AFFECTS_OTHER_IED` (`meta: { groups }`) before anything is written; without, everything the revision
 * brings, a write landing in another IED refused once staged (`meta: { ied, element }`): run `query.lifecycle.report`
 * first to see and skip what would.
 *
 * @intent update an S-IED from a newer revision of its template ISD, reconcile an IED with its template
 */
export async function ied(
	tx: Core.Transaction<Config>,
	params: UpdateIedParams,
): Promise<AppliedInstance<'IED'>[]> {
	const { sourceQuery, iedRef, anchor, fileType } = params
	const instance = await resolveIedInstance(tx, {
		sourceQuery,
		iedRef,
		scenario: 'template',
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
			scenario: 'template',
			keepNameTypesFrom: params.keepNameTypesFrom,
		})
		return [{ ref: placed.iedRef, placement: 'placed' }]
	}
	// a group the report blocks would change another IED: refused before anything is written, as apply refuses it
	if (params.report && params.decisions) {
		assertNoBlockedGroupAccepted({ groups: allGroups(params.report), decisions: params.decisions })
	}
	const removalBase = await resolveRemovalBase({
		policy: scenarioPolicy({ scenario: 'template' }),
		sourceQuery,
	})
	return reconcileIed(tx, { ...params, instance, removalBase, placeholderLineages: new Set() })
}

/**
 * Write what a report lists for an IED of the project a newer revision of its template updates: its tree reconciled
 * with the template's as the IED's groups decide (a logical node gained added, one dropped removed, a type changed
 * followed, a value the project may set kept unless taken over), the references it gained repointed onto what the
 * project holds, the revision recorded in its `IEDSourceFiles` when anything the template brings is accepted. What its
 * access points gained connects under the project's subnetworks, naming the IED as the project names it; what the
 * project holds there is its own (a subnetwork's settings, an address). The IED keeps its project name and its
 * identity; nothing it writes lands in another IED (refused otherwise). Returns the IED, `reconciled`.
 */
export async function reconcileIed(
	tx: Core.Transaction<Config>,
	params: ReconcileIedParams,
): Promise<AppliedInstance<'IED'>[]> {
	const { sourceQuery, iedRef, instance, report, decisions } = params
	const policy = scenarioPolicy({ scenario: 'template' })
	const { matchKey, identityMode, bumpsCollisions, namesFollow } = policy
	const groups = groupsForInstance(report, instance.id)
	const instanceRef = toRef(instance) as Scl.Ref<'IED'>
	// what the IED holds before the update: a write landing outside it and in another IED is refused
	const before = await tx.any.getTree(instanceRef)
	const from = tx.getStagedOperations().length

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
		removalBase: params.removalBase,
		namesFollow,
		placeholderLineages: params.placeholderLineages,
		takeOver: params.takeOver,
	})
	// what its access points gained connects to the project's subnetworks
	const connections = await connectAccessPoints(tx, { ...params, instanceRef, matchKey })
	const added = [...cloneMappings, ...connections]
	// a reference the update added may name an element the IED already holds, or one it added: it names the project's
	await repointAddedReferences(tx, { cloneMappings: added, instanceRootRef: instance, matchKey })
	if (before) await assertWritesInsideIed(tx, { instance: before, from })
	const reportInstance = reportInstanceById(report, instance.id)
	if (reportInstance) annotateInstance({ reportInstance, added: sourceToTargetMap(added) })

	// the IED now holds this revision of its template: its own reference names it
	if (followsSource({ groups, decisions })) {
		await writeProvenance(tx, {
			sourceQuery,
			target: { anchor: 'ied', root: instanceRef, fileType: params.fileType },
		})
	}
	return [{ ref: instanceRef, placement: 'reconciled' }]
}
