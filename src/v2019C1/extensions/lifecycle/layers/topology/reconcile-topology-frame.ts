import { findFrameInstances } from './find-frame-instances'
import { resolveInstanceLevels, toPinnedMatches } from './resolve-instance-levels'

import { toRef } from '@dialecte/core/helpers'

import { FRAME_OMIT_CHILD_TAGS } from '@/v2019C1/constants'
import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	collisionOverrides,
	groupsForInstance,
	reportInstanceById,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { scopeToTargetInstance } from '@/v2019C1/extensions/lifecycle/instance'

import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction/write-identity.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { InstanceAdditions } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'

/**
 * Reconcile a topology scope's OWN structural content (Substation/VoltageLevel/Bay attributes +
 * BayType + equipment) against a newer source, matched by identity.
 *
 * Finds the levels the scope instances sit on ({@link findFrameInstances}): by `templateUuid`
 * (stamp) / `uuid` (keep) for a level created from the scope root - rename-robust, since the frame
 * carries stamped lineage - or, for a level of the project the scope root was mapped onto, as the
 * one holding what the placement put there (it then only receives contributions). Then runs the shared engine `reconcile` over each matched
 * instance's structural subtree with the fn/app tags as a BOUNDARY, so the delegated
 * Applications/Functions are left to the fn/app cascade. Several bays may share one `templateUuid`
 * (a bay-typical instantiated more than once): EACH is reconciled, gated by ONLY its own report
 * groups (partitioned by instance) so the user can update a subset. No-op when no instance exists
 * (a first-time update instantiates instead).
 */
export async function reconcileTopologyFrame(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<TopologyStructuralTag>
		matchKey: MatchKey
		identityMode: IdentityMode
		report?: DiffReport
		decisions?: DecisionMap
		/** Multi-instance anchor: reconcile only the frame instance that IS the target (or under it). */
		targetInstance?: Scl.Ref<Scl.ElementsOf>
	},
): Promise<InstanceAdditions[]> {
	const { sourceQuery, scopeRef, matchKey, identityMode, report, decisions, targetInstance } =
		params

	const frameInstances = await findFrameInstances(tx, { sourceQuery, scopeRef, matchKey })
	const instances = await scopeToTargetInstance(tx, {
		instances: frameInstances.map((frameInstance) => frameInstance.instance),
		targetInstance,
	})

	// what was added to each frame instance: its references are repointed by the caller once the
	// fn/app cascade has placed everything they can point at
	const additions: InstanceAdditions[] = []

	for (const instance of instances) {
		const instanceGroups = groupsForInstance(report, instance.id)
		const accepted = decisions ? acceptedRefIds({ groups: instanceGroups, decisions }) : undefined
		const overrides = decisions
			? collisionOverrides({ groups: instanceGroups, decisions })
			: undefined

		// a level of the project the unit was mapped onto only receives what the template gives it
		const projectOwned = frameInstances.some(
			(frameInstance) => frameInstance.instance.id === instance.id && frameInstance.projectOwned,
		)
		// each level below the unit stands on the level this instance holds for it, or is new to it
		const instanceLevels = await resolveInstanceLevels(tx, {
			sourceQuery,
			scopeRef,
			frameInstance: toRef(instance) as Scl.Ref<Scl.ElementsOf>,
			matchKey,
		})
		const reconcileMappings = await reconcile(tx, {
			sourceQuery,
			sourceRootRef: scopeRef,
			instanceRootRef: instance,
			matchKey,
			identityMode,
			accepted,
			overrides,
			omit: FRAME_OMIT_CHILD_TAGS,
			instanceRootIsProjectOwned: projectOwned,
			pinnedMatches: toPinnedMatches({ instanceLevels, scopeRef }),
		})
		// carry the report->applied correlation onto this frame instance's report nodes (fn/app tags
		// are a boundary here — their instances are annotated by the fn/app cascade)
		const reportInstance = reportInstanceById(report, instance.id)
		additions.push({ instanceRootRef: instance, cloneMappings: reconcileMappings })
		if (reportInstance) {
			annotateInstance({ reportInstance, added: sourceToTargetMap(reconcileMappings) })
		}
	}

	return additions
}
