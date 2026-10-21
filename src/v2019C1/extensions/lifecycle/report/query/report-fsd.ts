import { reportFunction } from './report-function'
import { buildReportInstance } from './report-instance'

import { toRef } from '@dialecte/core/helpers'

import { assembleReport } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import {
	findByOwnUuid,
	findInstancesUnder,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import {
	PLACED_FUNCTION_TAGS,
	placedFunctionTag,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	describePlacementMappings,
	findLanding,
	resolvePrimaryPlacement,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'

import type { Scl, Config } from '@/v2019C1/config'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport, ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { DecisionMappings, ReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

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
		/** Placed afresh by a larger operation: a new instance whatever the project holds. */
		placesFresh?: boolean
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
		/**
		 * What tells an element the source dropped from one the project added, read once for the whole report.
		 * Default: the scenario's, a fork given no previous revision.
		 */
		removalBase?: RemovalBase
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, targetParent, scenario, targetInstance, decisionMappings } =
		params
	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	const policy = scenarioPolicy({ scenario, placesFresh: params.placesFresh })
	const { matchKey, refsAlwaysAdded } = policy
	const removalBase = params.removalBase ?? (await resolveRemovalBase({ policy, sourceQuery }))
	// a new instance is placed whatever the project holds: no existing one is matched
	const matched = policy.matchesInstances
		? await findInstancesUnder(query, {
				targetParent,
				tagName: placedFunctionTag(targetParent),
				sourceUuid,
				matchKey,
			})
		: []
	const instances = await scopeToTargetInstance(query, { instances: matched, targetInstance })

	// placed keeping the file's uuids: an element of the project already carrying the function's uuid is its instance,
	// wherever it sits — reported there, as the update reconciles it, even outside `targetInstance`: a uuid names one
	// element of a file, a second is never placed beside it
	if (instances.length === 0 && policy.placementIdentity === 'keep') {
		const owned = await findByOwnUuid(query, { tagNames: PLACED_FUNCTION_TAGS, uuid: sourceUuid })
		if (owned.length > 0) return reportWhereKept(query, { params, elements: owned })
	}

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
			refsAlwaysAdded,
			matchKey,
			decisionMappings,
			anchor: landing,
			removalBase,
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
			refsAlwaysAdded,
			matchKey,
			decisionMappings,
			anchor: targetParent,
			removalBase,
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

/** Report the elements of the project carrying the function's uuid where each sits, as {@link reportFsd} from its parent. */
async function reportWhereKept(
	query: Core.Query<Config>,
	context: { params: Parameters<typeof reportFsd>[1]; elements: readonly AnyTrackedRecord[] },
): Promise<DiffReport> {
	const { params, elements } = context
	const reportInstances: ReportInstance[] = []
	for (const element of elements) {
		if (!element.parent) continue
		const where = await reportFsd(query, {
			...params,
			targetParent: toRef(element.parent) as Scl.Ref<Scl.ElementsOf>,
			targetInstance: toRef(element) as Scl.Ref<Scl.ElementsOf>,
			placesFresh: false,
			resolvePlacement: false,
		})
		reportInstances.push(...where.instances)
	}
	return assembleReport({ instances: reportInstances, templateRoots: reportInstances })
}
