import { reportAsd } from './report-asd'
import { reportFsd } from './report-fsd'
import { reportTopologyFrame } from './report-topology-frame'

import { toRef } from '@dialecte/core/helpers'

import { assembleReport } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	describeHeldPlacement,
	describePlacementMappings,
	hasScopeInstance,
	resolveInstantiableRoot,
	resolvePlacementMappings,
	resolveTopologyReconcilables,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { matchKeyForScenario } from '@/v2019C1/extensions/lifecycle/scenario'

import type { Scl, Config } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport, ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlacementLevel } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
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
	},
): Promise<DiffReport> {
	const { sourceQuery, scopeRef, targetParent, scenario, targetInstance, decisionMappings } = params

	const root = scopeRef ?? (await resolveInstantiableRoot(sourceQuery))
	if (!root) return assembleReport([])

	const { applications, standaloneFunctions } = await resolveTopologyReconcilables(
		sourceQuery,
		root,
	)

	const instances: ReportInstance[] = []

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

	const frameInstances = await reportTopologyFrame(query, {
		sourceQuery,
		scopeRef: root,
		scenario,
		firstPlacement,
		targetInstance,
		mappedOnto,
		pinnedMatches,
	})
	instances.push(...frameInstances)

	// the levels are listed first, the shared elements follow
	const [placedFrame] = frameInstances
	if (placedFrame && placementLevels.length > 0) {
		const placementMappings = await describePlacementMappings(query, { levels: placementLevels })
		placedFrame.mappings = [...placementMappings, ...placedFrame.mappings]
	}
	// on an update, each instance lists the levels it already sits on
	for (const frameInstance of frameInstances) {
		if (firstPlacement || !frameInstance.rootRef) continue
		const heldPlacement = await describeHeldPlacement(query, {
			sourceQuery,
			scopeRef: root,
			frameInstance: toRef(frameInstance.rootRef) as Scl.Ref<Scl.ElementsOf>,
			matchKey,
		})
		frameInstance.mappings = [...heldPlacement, ...frameInstance.mappings]
	}

	// the primaries are reported from where the template lands: the deepest level of the project
	// its unit sits on or below — the element the consumer started from when there is none
	const landing = findLanding({ placementLevels, rootId: root.id }) ?? targetParent

	for (const applicationRef of applications) {
		const report = await reportAsd(query, {
			sourceQuery,
			applicationRef,
			scenario,
			targetInstance,
			decisionMappings,
			anchor: landing,
		})
		instances.push(...report.instances)
	}
	for (const functionRef of standaloneFunctions) {
		const report = await reportFsd(query, {
			sourceQuery,
			functionRef,
			targetParent: landing,
			scenario,
			targetInstance,
			decisionMappings,
		})
		instances.push(...report.instances)
	}

	const report = assembleReport(instances)
	// a level nothing is decided for is the consumer's to choose before anything is written
	if (placementLevels.some((level) => level.undecided)) report.needsDecisions = true
	return report
}

/**
 * The deepest element of the project on the chain the unit lands on: the unit itself when it is
 * mapped onto one, else the nearest level above it that is.
 */
function findLanding(params: {
	placementLevels: readonly PlacementLevel[]
	rootId: string
}): Scl.Ref<Scl.ElementsOf> | undefined {
	const { placementLevels, rootId } = params

	let levelId: string | undefined = rootId
	while (levelId) {
		const level = placementLevels.find((candidate) => candidate.sourceRef.id === levelId)
		if (!level) return undefined
		if (level.resolved.existing) return toRef(level.resolved.existing) as Scl.Ref<Scl.ElementsOf>
		levelId = level.parentSourceId
	}
	return undefined
}
