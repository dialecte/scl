import { reportFunction } from './report-function'
import { buildReportInstance } from './report-instance'

import { assembleReport } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { findInstancesUnder, scopeToTargetInstance } from '@/v2019C1/extensions/lifecycle/instance'
import { placedFunctionTag } from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	describePlacementMappings,
	findLanding,
	resolvePrimaryPlacement,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { matchKeyForScenario } from '@/v2019C1/extensions/lifecycle/scenario'

import type { Scl, Config } from '@/v2019C1/config'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport, ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings, ReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what `update.fromFsd` would change: a {@link DiffReport}
 * with the fast/full classification. No instance yet -> first-time = fast
 * (`needsDecisions: false`); one or more existing instances with changes -> full.
 *
 * Several instances of one template are allowed under one anchor, so
 * EVERY matching instance is diffed and reported as its own {@link ReportInstance};
 * the decision layer targets a subset (each instance owns its groups).
 *
 * A carried `FunctionCategory` satellite (outside the function subtree) travels
 * as a companion of the function's decision group.
 */
export async function reportFsd(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: FsdFunctionRef
		targetParent: Scl.Ref<Scl.ElementsOf>
		scenario?: LifecycleScenario
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		/** The consumer's choices for the shared elements the function is classified by. */
		decisionMappings?: DecisionMappings
		/**
		 * The function is placed by this operation alone (an FSD): started above the level it was made
		 * for, it lands on the level its template says. Left out when the caller already resolved
		 * where it lands (an application or a topology scope placing its own functions).
		 */
		resolvePlacement?: boolean
		/** What the whole report already listed and named. */
		pass?: ReportPass
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, targetParent, scenario, targetInstance, decisionMappings } =
		params
	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	const matchKey = matchKeyForScenario(scenario)
	// `instantiate` always places a NEW instance, so it never matches an existing one.
	const matched =
		scenario === 'instantiate'
			? []
			: await findInstancesUnder(query, {
					targetParent,
					tagName: placedFunctionTag(targetParent),
					sourceUuid,
					matchKey,
				})
	const instances = await scopeToTargetInstance(query, { instances: matched, targetInstance })

	// no instance yet -> first-time = fast track
	if (instances.length === 0) {
		// where the function lands: where the consumer started, or — started above the level the
		// function was made for — on the level its template says
		const placement = params.resolvePlacement
			? await resolvePrimaryPlacement(query, {
					sourceQuery,
					primaryRefs: [functionRef],
					anchor: targetParent,
					decisionMappings,
				})
			: { levels: [] }
		const templateLevel = placement.levels.at(-1)
		const landing =
			(templateLevel &&
				findLanding({ placementLevels: placement.levels, levelId: templateLevel.sourceRef.id })) ||
			targetParent

		const instanceDiff = await reportFunction(query, {
			pass: params.pass,
			sourceQuery,
			functionRef,
			instance: undefined,
			refsAlwaysAdded: scenario === 'instantiate',
			matchKey,
			decisionMappings,
			anchor: landing,
		})
		const reportInstance = await buildReportInstance(query, {
			instanceDiff,
			instance: undefined,
			sourceQuery,
			sourceRef: functionRef,
		})
		// the levels are listed first, the shared elements follow
		const placementMappings = await describePlacementMappings(query, { levels: placement.levels })
		reportInstance.mappings = [...placementMappings, ...reportInstance.mappings]

		const report = assembleReport({ instances: [reportInstance], templateRoots: [reportInstance] })
		report.offLevel = placement.offLevel
		// a level nothing is decided for is the consumer's to choose before anything is written
		if (placement.levels.some((level) => level.undecided)) report.needsDecisions = true
		return report
	}

	const reportInstances: ReportInstance[] = []
	for (const instance of instances) {
		const instanceDiff = await reportFunction(query, {
			pass: params.pass,
			sourceQuery,
			functionRef,
			instance,
			refsAlwaysAdded: scenario === 'instantiate',
			matchKey,
			decisionMappings,
			anchor: targetParent,
		})
		reportInstances.push(
			await buildReportInstance(query, {
				instanceDiff,
				instance,
				sourceQuery,
				sourceRef: functionRef,
			}),
		)
	}
	return assembleReport({ instances: reportInstances, templateRoots: reportInstances })
}
