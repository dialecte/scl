import { findFrameInstances } from './find-frame-instances'
import {
	resolveInstanceLevels,
	resolveTemplateFrame,
	toPinnedMatches,
} from './resolve-instance-levels'

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

import type { FrameReconciliation } from './reconcile-topology-frame.types'
import type { InstanceLevels } from './resolve-instance-levels.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction/write-identity.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { InstanceAdditions } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
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
		/** The consumer's choices, among them where a level the template gained lands per instance. */
		decisionMappings?: DecisionMappings
	},
): Promise<FrameReconciliation> {
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
	const instanceLevelsList: InstanceLevels[] = []
	// the template's levels, read once for every instance
	const templateFrame = await resolveTemplateFrame(sourceQuery, scopeRef)

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
		const { levels: instanceLevels, gained } = await resolveInstanceLevels(tx, {
			sourceQuery,
			templateFrame,
			frameInstance: toRef(instance) as Scl.Ref<Scl.ElementsOf>,
			matchKey,
			decisionMappings: params.decisionMappings,
		})
		// a level the template gained is created under the name the consumer asked for in the Map
		// step — a value edited in the review has the last word
		const levelOverrides = new Map(overrides ?? [])
		for (const { sourceRef, decision } of gained) {
			const name = decision && 'create' in decision ? decision.create.name : undefined
			const edited = levelOverrides.get(sourceRef.id)
			if (name && !edited?.name) levelOverrides.set(sourceRef.id, { ...edited, name })
		}
		const reconcileMappings = await reconcile(tx, {
			sourceQuery,
			sourceRootRef: scopeRef,
			instanceRootRef: instance,
			matchKey,
			identityMode,
			accepted,
			overrides: levelOverrides,
			omit: FRAME_OMIT_CHILD_TAGS,
			instanceRootIsProjectOwned: projectOwned,
			pinnedMatches: toPinnedMatches({ instanceLevels, scopeRef }),
		})
		// carry the report->applied correlation onto this frame instance's report nodes (fn/app tags
		// are a boundary here — their instances are annotated by the fn/app cascade)
		const created = sourceToTargetMap(reconcileMappings)
		const reportInstance = reportInstanceById(report, instance.id)
		additions.push({ instanceRootRef: instance, cloneMappings: reconcileMappings })
		if (reportInstance) annotateInstance({ reportInstance, added: created })

		// where each level now stands: a level new to the instance stands on the one just created
		const reconciledLevels = new Map<string, Scl.Ref<Scl.ElementsOf> | undefined>()
		for (const [sourceId, level] of instanceLevels) {
			const createdLevel = created.get(sourceId)
			reconciledLevels.set(
				sourceId,
				level ?? (createdLevel ? (toRef(createdLevel) as Scl.Ref<Scl.ElementsOf>) : undefined),
			)
		}
		instanceLevelsList.push(reconciledLevels)
	}

	return { additions, instanceLevelsList }
}
