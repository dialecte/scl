import { asd as updateAsd } from './asd'
import { fsd as updateFsd } from './fsd'

import { collisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
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
		!(await hasAnyInstance(tx, sourceQuery, { applicationRefs, standaloneFunctions, matchKey }))

	if (firstTime) {
		const overrides = decisions
			? collisionOverrides({ groups: report ? allGroups(report) : [], decisions })
			: undefined
		const { recordMappings } = await instantiateSsd(tx, {
			sourceQuery,
			scopeRef: root,
			targetParent,
			mode: identityModeForScenario(scenario),
			overrides,
		})
		return collectInstances(recordMappings)
	}

	const applications: Scl.Ref<'Application'>[] = []
	const functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[] = []

	// reconcile the topology frame's OWN content (BayType/equipment/attrs) before the fn/app
	// cascade; the fn/app tags are a boundary, so the cascade below owns them. Each frame
	// instance is gated by ONLY its own decision groups (from report.ssd) in the full track.
	await reconcileTopologyFrame(tx, {
		sourceQuery,
		scopeRef: root,
		matchKey,
		identityMode: identityModeForScenario(scenario),
		report,
		decisions,
		targetInstance,
	})

	for (const applicationRef of applicationRefs) {
		const result = await updateAsd(tx, {
			sourceQuery,
			applicationRef,
			targetParent,
			scenario,
			report,
			decisions,
			keepNameTypesFrom,
			targetInstance,
		})
		applications.push(...result.applications)
		functions.push(...result.functions)
	}

	for (const functionRef of standaloneFunctions) {
		const updated = await updateFsd(tx, {
			sourceQuery,
			functionRef,
			targetParent,
			scenario,
			report,
			decisions,
			keepNameTypesFrom,
			targetInstance,
		})
		functions.push(...updated)
	}

	return { applications, functions }
}

/** Whether any scope primary already has an instance in the target (by `templateUuid`). */
async function hasAnyInstance(
	tx: Core.Transaction<Config>,
	sourceQuery: Core.Query<Config>,
	params: {
		applicationRefs: Scl.Ref<'Application'>[]
		standaloneFunctions: Scl.Ref<'Function'>[]
		matchKey: MatchKey
	},
): Promise<boolean> {
	const { applicationRefs, standaloneFunctions, matchKey } = params

	for (const applicationRef of applicationRefs) {
		const { uuid } = await sourceQuery.getAttributes(applicationRef)
		if (!uuid) continue
		const instances = await findInstancesByTemplateUuid(tx, {
			tagName: 'Application',
			sourceUuid: uuid,
			matchKey,
		})
		if (instances.length > 0) return true
	}

	for (const functionRef of standaloneFunctions) {
		const { uuid } = await sourceQuery.getAttributes(functionRef)
		if (!uuid) continue
		const instances = await findInstancesByTemplateUuid(tx, {
			tagName: 'Function',
			sourceUuid: uuid,
			matchKey,
		})
		if (instances.length > 0) return true
	}

	return false
}

/** The instantiated Application / Function roots, read off the clone mappings by tag. */
function collectInstances(recordMappings: readonly Scl.CloneMapping[]): UpdateSsdResult {
	const applications: Scl.Ref<'Application'>[] = []
	const functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[] = []

	for (const mapping of recordMappings) {
		if (mapping.target.tagName === 'Application') {
			applications.push(mapping.target as Scl.Ref<'Application'>)
		} else if (mapping.target.tagName === 'Function' || mapping.target.tagName === 'SubFunction') {
			functions.push(mapping.target as Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)
		}
	}

	return { applications, functions }
}
