import { reportFunction } from './report-function'
import { buildReportInstance } from './report-instance'

import { toRef } from '@dialecte/core/helpers'

import { scopeFunctionCarried } from '@/v2019C1/extensions/lifecycle/cross-cutting/carried-satellites'
import { withReferencesNotPlaced } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import { assembleReport } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import {
	findByOwnUuid,
	findInstancesUnder,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import {
	PLACED_FUNCTION_TAGS,
	placedFunctionTag,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	describePlacementMappings,
	findLanding,
	resolveLandedLevels,
	resolvePrimaryPlacement,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { readTemplateLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'

import type { PlacementListing } from './placement-listing.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { CarriedScoping } from '@/v2019C1/extensions/lifecycle/cross-cutting/carried-satellites.types'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
import type { DiffReport, ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { PlacementLevel } from '@/v2019C1/extensions/lifecycle/layers/topology'
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
		/** What the consumer's resolution tells the diff, read once: see `DiffPolicy`. */
		diffPolicy: DiffPolicy
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
		/** On a first placement, the larger one it is part of (a unit of a substation template): see `PlacementListing`. */
		placementListing?: PlacementListing
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, targetParent, scenario, targetInstance, decisionMappings } =
		params
	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	const policy = scenarioPolicy({ scenario, placesFresh: params.placesFresh })
	// the template's levels, read once for the function and each of its instances
	const templateLevels = await readTemplateLevels(sourceQuery)
	const { matchKey, namesFollow } = policy
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

		// placed on its own, what the function holds naming what it does not place (a node no file of it holds, another
		// function) is not written, nor a variable it holds left applying to nothing: each reference told of; a reference
		// to a level of the template it lands on (those of the structure where it lands, and the ones its placement adds)
		// names where it landed
		const carried = params.placementListing
			? undefined
			: await scopeFunctionPlacedAlone(query, {
					sourceQuery,
					functionRef,
					landing,
					placementLevels: placement.levels,
				})
		const instanceDiff = await reportFunction(query, {
			templateLevels,
			pass: params.pass,
			sourceQuery,
			functionRef,
			instance: undefined,
			matchKey,
			decisionMappings,
			anchor: landing,
			notPlaced: carried?.leaveOut ?? new Set(),
			removalBase,
			diffPolicy: params.diffPolicy,
			placeholderLineages: params.placeholderLineages,
			namesFollow,
			placementListing: params.placementListing,
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
		// what the function carries naming a node the template does not hold, with what its satellites left out: told of
		const placed = withReferencesNotPlaced({
			told: reportInstance,
			referencesNotPlaced: carried?.referencesNotPlaced ?? [],
		})

		const report = assembleReport({ instances: [placed], templateRoots: [placed] })
		report.offLevel = placement.offLevel
		// a level nothing is decided for is the consumer's to choose before anything is written
		if (placement.levels.some((level) => level.undecided)) report.needsDecisions = true
		return report
	}

	const reportInstances: ReportInstance[] = []
	for (const instance of instances) {
		const instanceDiff = await reportFunction(query, {
			templateLevels,
			pass: params.pass,
			sourceQuery,
			functionRef,
			instance,
			matchKey,
			decisionMappings,
			anchor: targetParent,
			removalBase,
			diffPolicy: params.diffPolicy,
			placeholderLineages: params.placeholderLineages,
			namesFollow,
		})
		const reportInstance = await buildReportInstance(query, {
			instanceDiff,
			instance,
			sourceQuery,
			sourceRef: functionRef,
		})
		reportInstances.push(reportInstance)
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

/**
 * What a function placed on its own carries, scoped (`scopeFunctionCarried`) with the levels of the template above it
 * that land on a level of the project: those of the structure where it lands, and the ones its placement adds — as its
 * apply reads them once the levels are written.
 */
async function scopeFunctionPlacedAlone(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: FsdFunctionRef
		landing: Scl.Ref<Scl.ElementsOf>
		placementLevels: readonly PlacementLevel[]
	},
): Promise<CarriedScoping> {
	const { sourceQuery, functionRef } = params
	const structure = await resolveTargetStructure(query, params.landing)
	const landedTags = new Set<string>(
		params.placementLevels.map(function tagOf(level) {
			return level.sourceRef.tagName
		}),
	)
	for (const tagName of Object.keys(structure)) landedTags.add(tagName)
	const landedLevels = await resolveLandedLevels(sourceQuery, {
		primaryRef: functionRef,
		landsOn: function landsWhereItLands(level) {
			return landedTags.has(level.tagName)
		},
	})
	return scopeFunctionCarried(sourceQuery, { functionRef, landedLevels })
}
