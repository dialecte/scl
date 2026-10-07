import { reportAsd } from './report-asd'
import { reportFsd } from './report-fsd'
import { reportTopologyFrame } from './report-topology-frame'

import { toRef } from '@dialecte/core/helpers'

import { assembleReport } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { placeFor } from '@/v2019C1/extensions/lifecycle/engine/group'
import { linkPlacementDependencies } from '@/v2019C1/extensions/lifecycle/engine/link-placement-dependencies'
import {
	describePlacementMappings,
	findLanding,
	hasScopeInstance,
	resolveInstantiableRoot,
	resolvePlacementMappings,
	resolvePrimaryParents,
	resolveTopologyReconcilables,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { matchKeyForScenario } from '@/v2019C1/extensions/lifecycle/scenario'

import type { Scl, Config } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport, ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { InstanceLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { DecisionMappings, ReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what instantiating / updating an SSD would change: the union of the
 * per-primary reports for the scope's Applications (each cascading to its composed Functions,
 * via {@link reportAsd}) and its standalone Functions ({@link reportFsd}). The instances are
 * merged into one {@link DiffReport}, so `groups` covers every primary and the fast/full
 * classification holds across the whole SSD.
 *
 * The scope defaults to the SSD's instantiable root.
 */
export async function reportSsd(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef?: Scl.Ref<TopologyStructuralTag>
		targetParent: Scl.Ref<Scl.ElementsOf>
		scenario?: LifecycleScenario
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		/** The consumer's choices for the shared elements the applications refer to. */
		decisionMappings?: DecisionMappings
		/** What the whole report already listed and named. */
		pass?: ReportPass
	},
): Promise<DiffReport> {
	const { sourceQuery, scopeRef, targetParent, scenario, targetInstance, decisionMappings } = params

	const root = scopeRef ?? (await resolveInstantiableRoot(sourceQuery))
	if (!root) return assembleReport([])

	const { applications, standaloneFunctions } = await resolveTopologyReconcilables(
		sourceQuery,
		root,
	)

	// the topology frame's own structural changes (Bay attrs / BayType / equipment), fn/app excluded;
	// one ReportInstance per bay when a bay-typical was instantiated more than once
	// a first placement: asked for, or the project holds no instance of the scope yet
	const matchKey = matchKeyForScenario(scenario)
	const firstPlacement =
		scenario === 'instantiate' ||
		!(await hasScopeInstance(query, {
			sourceQuery,
			applicationRefs: applications,
			standaloneFunctions,
			matchKey,
		}))

	// where each level of the template lands, on a first placement
	const placementLevels = firstPlacement
		? await resolvePlacementMappings(query, {
				sourceQuery,
				scopeRef: root,
				anchor: targetParent,
				decisionMappings,
			})
		: []
	const rootLevel = placementLevels.find((level) => level.sourceRef.id === root.id)
	const mappedOnto = rootLevel?.resolved.existing
		? (toRef(rootLevel.resolved.existing) as Scl.Ref<Scl.ElementsOf>)
		: undefined

	// each level below the root lands on the element it is mapped onto, or is new
	const pinnedMatches = new Map<string, string | undefined>()
	for (const level of placementLevels) {
		if (level.context || level.sourceRef.id === root.id) continue
		pinnedMatches.set(level.sourceRef.id, level.resolved.existing?.id)
	}

	// on an update, each instance lists the levels it sits on and those the template gained — read
	// once per instance, with where each level stands for the primaries the template gained
	const { instances: frameInstances, instanceLevelsList } = await reportTopologyFrame(query, {
		sourceQuery,
		scopeRef: root,
		scenario,
		firstPlacement,
		targetInstance,
		mappedOnto,
		pinnedMatches,
		decisionMappings,
	})

	// the levels are listed first, the shared elements follow
	const [placedFrame] = frameInstances
	if (placedFrame && placementLevels.length > 0) {
		const placementMappings = await describePlacementMappings(query, { levels: placementLevels })
		placedFrame.mappings = [...placementMappings, ...placedFrame.mappings]
	}
	// the primaries are reported from where the template lands: the deepest level of the project
	// its unit sits on or below — the element the consumer started from when there is none
	const landing = findLanding({ placementLevels, levelId: root.id }) ?? targetParent

	// on an update, a primary the template gained is placed in each instance of the unit that holds
	// it: listed once per place, each decided on its own — as the apply places it
	const primaryInstances: ReportInstance[] = []
	for (const applicationRef of applications) {
		const places = await findGainedPlaces(query, {
			sourceQuery,
			primaryRef: applicationRef,
			anchor: landing,
			instanceLevelsList,
			matchKey,
		})
		for (const placedFor of places ?? [undefined]) {
			const report = await reportAsd(query, {
				pass: params.pass,
				sourceQuery,
				applicationRef,
				scenario: placedFor ? 'instantiate' : scenario,
				targetInstance,
				decisionMappings,
				anchor: placedFor ?? landing,
			})
			primaryInstances.push(...placedInstances({ instances: report.instances, placedFor }))
		}
	}
	for (const functionRef of standaloneFunctions) {
		const places = await findGainedPlaces(query, {
			sourceQuery,
			primaryRef: functionRef,
			anchor: landing,
			instanceLevelsList,
			matchKey,
		})
		for (const placedFor of places ?? [undefined]) {
			const report = await reportFsd(query, {
				pass: params.pass,
				sourceQuery,
				functionRef,
				targetParent: placedFor ?? landing,
				scenario: placedFor ? 'instantiate' : scenario,
				targetInstance,
				decisionMappings,
			})
			primaryInstances.push(...placedInstances({ instances: report.instances, placedFor }))
		}
	}

	// what lands in a level the placement adds goes with it, a reference with what it points at
	for (const scope of listPlacementScopes({
		firstPlacement,
		frameInstances,
		primaryInstances,
		instanceLevelsList,
	})) {
		await linkPlacementDependencies(sourceQuery, { instances: scope })
	}

	const report = assembleReport([...frameInstances, ...primaryInstances])
	// a level nothing is decided for is the consumer's to choose before anything is written
	if (placementLevels.some((level) => level.undecided)) report.needsDecisions = true
	return report
}

/**
 * The places a primary the template gained is placed in, when there are several (one per instance
 * of the unit that holds it). Nothing when it is held already or placed in one place only.
 */
async function findGainedPlaces(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<'Application'> | Scl.Ref<'Function'>
		anchor: Scl.Ref<Scl.ElementsOf>
		instanceLevelsList: readonly InstanceLevels[]
		matchKey: MatchKey
	},
): Promise<Scl.Ref<Scl.ElementsOf>[] | undefined> {
	if (params.instanceLevelsList.length < 2) return undefined
	const placement = await resolvePrimaryParents(query, params)
	return placement.gained && placement.parents.length > 1 ? placement.parents : undefined
}

/**
 * The report instances of each placement: on a first placement, all of them; on an update, each
 * instance of the unit with the primaries placed in it afresh — those listed for one of its levels,
 * and those listed once, which land in every instance.
 */
function listPlacementScopes(params: {
	firstPlacement: boolean
	frameInstances: readonly ReportInstance[]
	primaryInstances: readonly ReportInstance[]
	instanceLevelsList: readonly InstanceLevels[]
}): ReportInstance[][] {
	const { firstPlacement, frameInstances, primaryInstances, instanceLevelsList } = params
	if (firstPlacement) return [[...frameInstances, ...primaryInstances]]

	const placed = primaryInstances.filter((instance) => !instance.rootRef)
	return frameInstances.map((frameInstance, index) => {
		const levelIds = new Set<string | undefined>([frameInstance.rootRef?.id])
		for (const level of instanceLevelsList[index]?.values() ?? []) levelIds.add(level?.id)
		return [
			frameInstance,
			...placed.filter((instance) => !instance.placedFor || levelIds.has(instance.placedFor.id)),
		]
	})
}

/** The instances of a report made for one place, each placed under it. */
function placedInstances(params: {
	instances: ReportInstance[]
	placedFor: Scl.Ref<Scl.ElementsOf> | undefined
}): ReportInstance[] {
	const { instances, placedFor } = params
	if (!placedFor) return instances
	for (const instance of instances) placeFor({ instance, placedFor })
	return instances
}
