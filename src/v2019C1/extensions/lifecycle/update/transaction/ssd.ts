import { asd as updateAsd } from './asd'
import { fsd as updateFsd } from './fsd'

import { toRef } from '@dialecte/core/helpers'

import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import { collisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { repointAddedReferences } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references'
import {
	findInstancesByTemplateUuid,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	findFrameInstances,
	hasScopeInstance,
	resolveInstanceLevels,
	resolveInstantiableRoot,
	reconcileTopologyFrame,
	resolveTopologyReconcilables,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import {
	identityModeForScenario,
	matchKeyForScenario,
} from '@/v2019C1/extensions/lifecycle/scenario'

import type { Scl, Config } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { InstanceLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'

type UpdateSsdResult = {
	applications: Scl.Ref<'Application'>[]
	functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]
}

/**
 * `update.fromSsd` - reconcile a project against a (possibly newer) SSD.
 *
 * Mirrors `update.fromAsd` one layer up:
 *  - **first-time** (no instance of any scope primary, or a forced `instantiate`) delegates to
 *    `instantiate.ssd`, so the source is recorded ONCE at document level (`Header > SourceFiles`),
 *    consistent with the direct verb - not scattered per primary.
 *  - **reconcile** cascades to the per-primary update verbs: each Application via `update.fromAsd`
 *    (which cascades to its composed Functions) and each standalone Function via `update.fromFsd`.
 *
 * `report` + `decisions` gate every write, partitioned per instance by the sub-verbs. The scope
 * defaults to the SSD's instantiable root.
 */
export async function ssd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef?: Scl.Ref<TopologyStructuralTag>
		targetParent: Scl.Ref<Scl.ElementsOf>
		scenario?: LifecycleScenario
		report?: DiffReport
		decisions?: DecisionMap
		keepNameTypesFrom?: KeepNameTypesFrom
		/** Multi-instance anchor: scope to ONE placed Bay (frame + fn/app under it). Absent = all. */
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		/** The consumer's choices for the shared elements the applications refer to. */
		decisionMappings?: DecisionMappings
	},
): Promise<UpdateSsdResult> {
	const {
		sourceQuery,
		scopeRef,
		targetParent,
		scenario,
		report,
		decisions,
		keepNameTypesFrom,
		targetInstance,
	} = params

	const root = scopeRef ?? (await resolveInstantiableRoot(sourceQuery))
	if (!root) return { applications: [], functions: [] }

	const { applications: applicationRefs, standaloneFunctions } = await resolveTopologyReconcilables(
		sourceQuery,
		root,
	)

	const matchKey = matchKeyForScenario(scenario)
	const firstTime =
		scenario === 'instantiate' ||
		!(await hasScopeInstance(tx, {
			sourceQuery,
			applicationRefs,
			standaloneFunctions,
			matchKey,
		}))

	if (firstTime) {
		const overrides = decisions
			? collisionOverrides({ groups: report ? allGroups(report) : [], decisions })
			: undefined
		const { cloneMappings } = await instantiateSsd(tx, {
			sourceQuery,
			scopeRef: root,
			targetParent,
			mode: identityModeForScenario(scenario),
			overrides,
			decisionMappings: params.decisionMappings,
		})
		// first-time SSD clones the whole scope (frame + fn/app) in one pass; annotate every first-time
		// report instance (frame, applications, standalone functions) from the shared map
		const added = sourceToTargetMap(cloneMappings)
		for (const reportInstance of report?.instances ?? []) {
			if (!reportInstance.rootRef) annotateInstance({ reportInstance, added })
		}
		return collectInstances(cloneMappings)
	}

	const applications: Scl.Ref<'Application'>[] = []
	const functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[] = []

	// reconcile the topology frame's OWN content (BayType/equipment/attrs) before the fn/app
	// cascade; the fn/app tags are a boundary, so the cascade below owns them. Each frame
	// instance is gated by ONLY its own decision groups (from report.ssd) in the full track.
	const frameAdditions = await reconcileTopologyFrame(tx, {
		sourceQuery,
		scopeRef: root,
		matchKey,
		identityMode: identityModeForScenario(scenario),
		report,
		decisions,
		targetInstance,
	})

	// where each instance of the unit lives, once the frame reconcile has added the levels it gained
	const frameInstances = await findFrameInstances(tx, { sourceQuery, scopeRef: root, matchKey })
	const scopedInstances = await scopeToTargetInstance(tx, {
		instances: frameInstances.map((frameInstance) => frameInstance.instance),
		targetInstance,
	})
	const instanceLevelsList: InstanceLevels[] = []
	for (const instance of scopedInstances) {
		const instanceLevels = await resolveInstanceLevels(tx, {
			sourceQuery,
			scopeRef: root,
			frameInstance: toRef(instance) as Scl.Ref<Scl.ElementsOf>,
			matchKey,
		})
		instanceLevelsList.push(instanceLevels)
	}

	for (const applicationRef of applicationRefs) {
		const placementParents = await resolvePrimaryParents(tx, {
			sourceQuery,
			primaryRef: applicationRef,
			anchor: targetParent,
			instanceLevelsList,
			matchKey,
		})
		for (const placementParent of placementParents) {
			const result = await updateAsd(tx, {
				sourceQuery,
				applicationRef,
				targetParent: placementParent,
				scenario,
				report,
				decisions,
				keepNameTypesFrom,
				targetInstance,
				decisionMappings: params.decisionMappings,
			})
			applications.push(...result.applications)
			functions.push(...result.functions)
		}
	}

	for (const functionRef of standaloneFunctions) {
		const placementParents = await resolvePrimaryParents(tx, {
			sourceQuery,
			primaryRef: functionRef,
			anchor: targetParent,
			instanceLevelsList,
			matchKey,
		})
		for (const placementParent of placementParents) {
			const updated = await updateFsd(tx, {
				sourceQuery,
				functionRef,
				targetParent: placementParent,
				scenario,
				report,
				decisions,
				keepNameTypesFrom,
				targetInstance,
				decisionMappings: params.decisionMappings,
			})
			functions.push(...updated)
		}
	}

	// the references the frame gained can point at anything the cascade placed above
	for (const { instanceRootRef, cloneMappings } of frameAdditions) {
		await repointAddedReferences(tx, { cloneMappings, instanceRootRef, matchKey })
	}

	return { applications, functions }
}

/**
 * The elements of the project a primary of the scope is updated under.
 *
 * A primary the project already holds an instance of is reconciled where its instances are: under
 * the element the consumer started from. A primary the template GAINED has none: it is placed once
 * per instance of the unit, on the level that instance holds for the level the primary sits on in
 * the template — in the bay the instance lives in, not under the element the update was started
 * from. With no instance of the unit to tell, it falls back on that element.
 */
async function resolvePrimaryParents(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<'Application'> | Scl.Ref<'Function'>
		/** The element of the project the consumer started from. */
		anchor: Scl.Ref<Scl.ElementsOf>
		/** Where each instance of the unit lives, level by level. */
		instanceLevelsList: readonly InstanceLevels[]
		matchKey: MatchKey
	},
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const { sourceQuery, primaryRef, anchor, instanceLevelsList, matchKey } = params

	const sourceUuid = await sourceQuery.any.getAttribute(primaryRef, { name: 'uuid' })
	const held = await findInstancesByTemplateUuid(tx, {
		tagName: primaryRef.tagName,
		sourceUuid,
		matchKey,
	})
	if (held.length > 0) return [anchor]

	const sourceAncestors = await sourceQuery.findAncestors(primaryRef, {
		stopAtTagName: 'Substation',
	})
	const instanceParents: Scl.Ref<Scl.ElementsOf>[] = []
	for (const instanceLevels of instanceLevelsList) {
		const sourceLevel = sourceAncestors.find((ancestor) => instanceLevels.has(ancestor.id))
		const level = sourceLevel && instanceLevels.get(sourceLevel.id)
		if (level) instanceParents.push(level)
	}
	return instanceParents.length > 0 ? instanceParents : [anchor]
}

/** The instantiated Application / Function roots, read off the clone mappings by tag. */
function collectInstances(cloneMappings: readonly Scl.CloneMapping[]): UpdateSsdResult {
	const applications: Scl.Ref<'Application'>[] = []
	const functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[] = []

	for (const mapping of cloneMappings) {
		if (mapping.target.tagName === 'Application') {
			applications.push(mapping.target as Scl.Ref<'Application'>)
		} else if (mapping.target.tagName === 'Function' || mapping.target.tagName === 'SubFunction') {
			functions.push(mapping.target as Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)
		}
	}

	return { applications, functions }
}
