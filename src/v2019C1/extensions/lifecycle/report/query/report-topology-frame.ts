import { buildReportInstance } from './report-instance'

import { toRef } from '@dialecte/core/helpers'

import { FRAME_OMIT_CHILD_TAGS } from '@/v2019C1/constants'
import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { scopeToTargetInstance } from '@/v2019C1/extensions/lifecycle/instance'
import {
	describeGainedLevels,
	describeHeldPlacement,
	findFrameInstances,
	resolveInstanceLevels,
	resolveTemplateFrame,
	toPinnedMatches,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { matchKeyForScenario } from '@/v2019C1/extensions/lifecycle/scenario'

import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PinnedMatches } from '@/v2019C1/extensions/lifecycle/engine/match-child'
import type { InstanceLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what `update.ssd` would change in the topology scope's OWN structural content
 * (Substation/VoltageLevel/Bay attributes + BayType + equipment), matched by the stamped
 * `templateUuid` lineage — on each level an instance sits on ({@link findFrameInstances}): one
 * created from the scope root, or one of the project the scope root was mapped onto, which only
 * receives what the template contributes below it. The fn/app tags are a BOUNDARY: their changes are covered by the per-primary
 * Application/Function reports, so this diff excludes them.
 *
 * Several bays may share one `templateUuid` (a bay-typical instantiated more than once), so EVERY
 * matching instance is diffed and returned as its own {@link ReportInstance}; each owns its groups so
 * the decision layer can target a subset. On a first placement the frame is reported as one added
 * instance, or against the element of the project its root is mapped onto.
 *
 * On an update, where each level of the unit stands is read once per instance and serves the diff,
 * the levels listed as held, the levels the template gained (each the consumer's choice), and is
 * returned for the primaries the template gained (`instanceLevelsList`).
 */
export async function reportTopologyFrame(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<TopologyStructuralTag>
		scenario?: LifecycleScenario
		/** The project holds no instance of the scope yet, or a new one was asked for. */
		firstPlacement?: boolean
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		/** The element of the project the scope root is mapped onto, on a first placement. */
		mappedOnto?: Scl.Ref<Scl.ElementsOf>
		/** Where each level below the scope root lands, on a first placement. */
		pinnedMatches?: PinnedMatches
		/** The consumer's choices, among them where a level the template gained lands per instance. */
		decisionMappings?: DecisionMappings
	},
): Promise<{ instances: ReportInstance[]; instanceLevelsList: InstanceLevels[] }> {
	const { sourceQuery, scopeRef, scenario, targetInstance, mappedOnto, pinnedMatches } = params
	const matchKey = matchKeyForScenario(scenario)

	// On instantiate the frame scope root is entirely ADDED: diff the source root against NO instance
	// (instanceRootRef undefined) so the added frame (Substation/VoltageLevel/Bay attrs + equipment,
	// fn/app omitted) surfaces as its own report instance with `rootRef` undefined. `apply` then fills
	// each node's `appliedRef` (the placed TEMPLATE_1 element), so the consumer places the added frame
	// on the NEW bay — not conflated with the existing same-named one.
	// A root MAPPED onto an element of the project is that element: what it holds is left as it is,
	// only what it lacks is added — and each level below it lands where its own mapping says.
	if (params.firstPlacement ?? scenario === 'instantiate') {
		const instanceDiff = await diff({
			sourceQuery,
			targetQuery: query,
			sourceRootRef: scopeRef,
			instanceRootRef: mappedOnto,
			matchKey,
			omit: FRAME_OMIT_CHILD_TAGS,
			...(mappedOnto
				? { instanceRootIsProjectOwned: true, contributeOnly: true, pinnedMatches }
				: {}),
		})
		const reportInstance = await buildReportInstance(query, {
			instanceDiff,
			instance: undefined,
			sourceQuery,
			sourceRef: scopeRef,
		})
		return { instances: [reportInstance], instanceLevelsList: [] }
	}

	const frameInstances = await findFrameInstances(query, { sourceQuery, scopeRef, matchKey })
	const instances = await scopeToTargetInstance(query, {
		instances: frameInstances.map((frameInstance) => frameInstance.instance),
		targetInstance,
	})

	const reportInstances: ReportInstance[] = []
	const instanceLevelsList: InstanceLevels[] = []
	// the template's levels, read once for every instance
	const templateFrame = await resolveTemplateFrame(sourceQuery, scopeRef)
	for (const instance of instances) {
		// a level of the project the unit was mapped onto only receives what the template gives it
		const projectOwned = frameInstances.some(
			(frameInstance) => frameInstance.instance.id === instance.id && frameInstance.projectOwned,
		)
		// each level below the unit stands on the level this instance holds for it, or is new to it
		const frameInstance = toRef(instance) as Scl.Ref<Scl.ElementsOf>
		const placement = await resolveInstanceLevels(query, {
			sourceQuery,
			templateFrame,
			frameInstance,
			matchKey,
			decisionMappings: params.decisionMappings,
		})
		instanceLevelsList.push(placement.levels)
		const instanceDiff = await diff({
			sourceQuery,
			targetQuery: query,
			sourceRootRef: scopeRef,
			instanceRootRef: instance,
			matchKey,
			omit: FRAME_OMIT_CHILD_TAGS,
			pinnedMatches: toPinnedMatches({ instanceLevels: placement.levels, scopeRef }),
			...(projectOwned ? { instanceRootIsProjectOwned: true } : {}),
		})
		const reportInstance = await buildReportInstance(query, {
			instanceDiff,
			instance,
			sourceQuery,
			sourceRef: scopeRef,
		})
		// the levels it already sits on (held), then the ones the template gained (the consumer's call)
		const held = await describeHeldPlacement(query, { placement })
		const gained = await describeGainedLevels(query, { sourceQuery, frameInstance, placement })
		reportInstance.mappings = [...held, ...gained, ...reportInstance.mappings]
		reportInstances.push(reportInstance)
	}
	return { instances: reportInstances, instanceLevelsList }
}
