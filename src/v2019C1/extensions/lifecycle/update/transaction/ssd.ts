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
import { scopeToTargetInstance } from '@/v2019C1/extensions/lifecycle/instance'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	findFrameInstances,
	hasScopeInstance,
	resolveInstanceLevelsList,
	resolveInstantiableRoot,
	resolvePrimaryParents,
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
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
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
	const instanceLevelsList = await resolveInstanceLevelsList(tx, {
		sourceQuery,
		scopeRef: root,
		instances: scopedInstances.map((instance) => toRef(instance) as Scl.Ref<Scl.ElementsOf>),
		matchKey,
	})

	for (const applicationRef of applicationRefs) {
		const placement = await resolvePrimaryParents(tx, {
			sourceQuery,
			primaryRef: applicationRef,
			anchor: targetParent,
			instanceLevelsList,
			matchKey,
		})
		for (const placementParent of placement.parents) {
			const result = await updateAsd(tx, {
				sourceQuery,
				applicationRef,
				targetParent: placementParent,
				// a gained application is a fresh one in each instance, whatever another instance holds
				scenario: placement.gained ? 'instantiate' : scenario,
				// placed as part of the substation template: its provenance is the document's
				partOfTemplate: true,
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
		const placement = await resolvePrimaryParents(tx, {
			sourceQuery,
			primaryRef: functionRef,
			anchor: targetParent,
			instanceLevelsList,
			matchKey,
		})
		for (const placementParent of placement.parents) {
			const updated = await updateFsd(tx, {
				sourceQuery,
				functionRef,
				targetParent: placementParent,
				scenario: placement.gained ? 'instantiate' : scenario,
				partOfTemplate: true,
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
