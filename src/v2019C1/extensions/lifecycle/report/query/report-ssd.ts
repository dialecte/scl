import { foldCrossCuttingSatellites } from './cross-cutting-satellites'
import { createPlacementListing } from './placement-listing'
import { reportAsd } from './report-asd'
import { reportFsd } from './report-fsd'
import { reportTopologyFrame } from './report-topology-frame'

import { toRef } from '@dialecte/core/helpers'

import { readSatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { readHeldApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications'
import { assembleReport } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { addDroppedGroups, placeFor } from '@/v2019C1/extensions/lifecycle/engine/group'
import { linkPlacementDependencies } from '@/v2019C1/extensions/lifecycle/engine/link-placement-dependencies'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { collectComposedFunctionUuids } from '@/v2019C1/extensions/lifecycle/instance'
import {
	describePlacementMappings,
	findDroppedPrimaries,
	findLanding,
	hasScopeInstance,
	pinLeftOut,
	resolveSsdScope,
	resolvePlacementMappings,
	resolvePrimaryParents,
	resolveFrameLandings,
	resolveLandedLevels,
	resolveTopologyReconcilables,
	resolveUnitPlacement,
	withLandedLevels,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'

import type { SatelliteFoldTarget } from './cross-cutting-satellites.types'
import type { PlacementListing } from './placement-listing.types'
import type { FoldFrameSatellitesParams } from './report-ssd.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
import type {
	DecisionGroup,
	DiffReport,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type {
	PrimaryPlace,
	ResolvePrimaryParentsParams,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { PlacementLevel } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { DecisionMappings, ReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what instantiating / updating an SSD would change: the union of the
 * per-primary reports for the scope's Applications (each cascading to its composed Functions,
 * via {@link reportAsd}) and its standalone Functions ({@link reportFsd}). The instances are
 * merged into one {@link DiffReport}, so `groups` covers every primary and the fast/full
 * classification holds across the whole SSD. On a first placement, a variable or a behaviour description is
 * listed once, with the first primary it applies to; what applies to the levels only, or what they hold applying to
 * no primary, with the frame.
 *
 * The scope is the element the consumer names, the unit its `TEMPLATE` scaffolding holds when it names that; several
 * units there and none chosen is refused with `SSD_SCOPE_AMBIGUOUS`.
 */
export async function reportSsd(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		/**
		 * The element of the SSD the consumer names (see {@link resolveSsdScope}): a named level is the scope, the
		 * `TEMPLATE` scaffolding is walked down to the one unit it holds. None: read from the file.
		 */
		scopeRef?: Scl.Ref<TopologyStructuralTag>
		targetParent: Scl.Ref<Scl.ElementsOf>
		scenario?: LifecycleScenario
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		/** The consumer's choices for the shared elements the applications refer to. */
		decisionMappings?: DecisionMappings
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
	},
): Promise<DiffReport> {
	const { sourceQuery, scopeRef, targetParent, scenario, targetInstance, decisionMappings } = params

	const scope = await resolveSsdScope(sourceQuery, { ref: scopeRef })
	if (!scope) return assembleReport({ instances: [], templateRoots: [] })
	const { root } = scope

	const { applications, standaloneFunctions } = await resolveTopologyReconcilables(sourceQuery, {
		scopeRef: root,
		leftOut: scope.leftOut,
	})

	// the topology frame's own structural changes (Bay attrs / BayType / equipment), fn/app excluded;
	// one ReportInstance per bay when a bay-typical was instantiated more than once
	// a first placement: asked for, or the project holds no instance of the scope yet
	const policy = scenarioPolicy({ scenario })
	const { matchKey, namesFollow } = policy
	const removalBase = params.removalBase ?? (await resolveRemovalBase({ policy, sourceQuery }))
	const firstPlacement =
		!policy.matchesInstances ||
		!(await hasScopeInstance(query, {
			sourceQuery,
			scopeRef: root,
			applicationRefs: applications,
			standaloneFunctions,
			matchKey,
			leftOut: scope.leftOut,
		}))

	// where each level of the template lands, on a first placement
	const placementLevels = firstPlacement
		? await resolvePlacementMappings(query, {
				sourceQuery,
				scopeRef: root,
				anchor: targetParent,
				decisionMappings,
				rootIsContext: scope.scaffolding,
				leftOut: scope.leftOut,
			})
		: []
	const rootLevel = placementLevels.find((level) => level.sourceRef.id === root.id)
	const mappedOnto = rootLevel?.resolved.existing
		? (toRef(rootLevel.resolved.existing) as Scl.Ref<Scl.ElementsOf>)
		: undefined

	// each level below the root lands on the element it is mapped onto, or is new
	// a unit the scope leaves out is never matched to what the project holds
	const pinnedMatches = pinLeftOut({ pinnedMatches: new Map(), leftOut: scope.leftOut })
	for (const level of placementLevels) {
		if (level.context || level.sourceRef.id === root.id) continue
		pinnedMatches.set(level.sourceRef.id, level.resolved.existing?.id)
	}

	// on an update, each instance lists the levels it sits on and those the template gained — read
	// once per instance, with where each level stands for the primaries the template gained
	const { instances: frameInstances, instanceLevelsList } = await reportTopologyFrame(query, {
		sourceQuery,
		scopeRef: root,
		matchKey,
		firstPlacement,
		targetInstance,
		mappedOnto,
		pinnedMatches,
		decisionMappings,
		removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow,
		leftOut: scope.leftOut,
	})
	// the applications and functions each instance holds that the newer template no longer does
	for (const frameInstance of frameInstances) {
		if (!frameInstance.rootRef) continue
		const dropped = await findDroppedPrimaries(query, {
			sourceQuery,
			scopeRef: root,
			frameInstance: frameInstance.rootRef,
			matchKey,
			removalBase,
			leftOut: scope.leftOut,
		})
		const groups = addDroppedGroups({ reportInstance: frameInstance, dropped })
		await linkToComposingApplications(query, { groups })
	}

	// the levels are listed first, the shared elements follow
	const [placedFrame] = frameInstances
	if (placedFrame && placementLevels.length > 0) {
		const placementMappings = await describePlacementMappings(query, { levels: placementLevels })
		placedFrame.mappings = [...placementMappings, ...placedFrame.mappings]
	}
	// the primaries are reported from where the template lands: the deepest level of the project
	// its unit sits on or below — the element the consumer started from when there is none
	const landing = findLanding({ placementLevels, levelId: root.id }) ?? targetParent
	// a first placement places what applies to the unit, what its levels hold, and a function its applications share,
	// once
	const placementListing = firstPlacement
		? await listUnitPlacement(query, {
				sourceQuery,
				matchKey,
				scopeRef: root,
				applicationRefs: applications,
				standaloneFunctions,
				leftOut: scope.leftOut,
				placementLevels,
			})
		: undefined

	// the satellites of the template, read once for every primary and every placement
	const index = placementListing?.index ?? (await readSatelliteIndex(sourceQuery))

	// on an update, a primary the template gained is placed in each instance of the unit: listed once
	// per instance (for the level the instance sits on), each decided on its own — as the apply
	// places it. Where its level is not written yet, it is reported from the level the instance sits on.
	const primaryInstances: ReportInstance[] = []
	for (const applicationRef of applications) {
		const places = await findPrimaryPlaces(query, {
			sourceQuery,
			primaryRef: applicationRef,
			anchor: landing,
			unitId: root.id,
			instanceLevelsList,
			matchKey,
		})
		for (const { parent, placedFor } of places) {
			const report = await reportAsd(query, {
				placementListing,
				pass: params.pass,
				sourceQuery,
				applicationRef,
				// placed for an instance of the unit: a new one, whatever another instance holds
				scenario,
				placesFresh: placedFor !== undefined,
				targetInstance,
				decisionMappings,
				anchor: parent ?? placedFor ?? landing,
				removalBase,
				diffPolicy: params.diffPolicy,
				placeholderLineages: params.placeholderLineages,
				index,
			})
			primaryInstances.push(...placedInstances({ instances: report.instances, placedFor }))
		}
	}
	for (const functionRef of standaloneFunctions) {
		const places = await findPrimaryPlaces(query, {
			sourceQuery,
			primaryRef: functionRef,
			anchor: landing,
			unitId: root.id,
			instanceLevelsList,
			matchKey,
		})
		for (const { parent, placedFor } of places) {
			const report = await reportFsd(query, {
				placementListing,
				pass: params.pass,
				sourceQuery,
				functionRef,
				targetParent: parent ?? placedFor ?? landing,
				scenario,
				placesFresh: placedFor !== undefined,
				targetInstance,
				decisionMappings,
				removalBase,
				diffPolicy: params.diffPolicy,
				placeholderLineages: params.placeholderLineages,
			})
			primaryInstances.push(...placedInstances({ instances: report.instances, placedFor }))
		}
	}

	// what applies to the levels only, and what they hold applying to no primary placed, goes with the frame
	if (placedFrame && placementListing) {
		// what the functions and the frame of the unit carry naming what the placement does not place (a node the template
		// does not hold, an element left out): not written, told of with the frame
		const carriedNotPlaced = placementListing.carried.referencesNotPlaced
		if (carriedNotPlaced.length > 0) {
			placedFrame.referencesNotPlaced = [
				...(placedFrame.referencesNotPlaced ?? []),
				...carriedNotPlaced,
			]
		}
		await foldFrameSatellites(query, {
			sourceQuery,
			placedFrame,
			scopeRef: root,
			anchor: landing,
			matchKey,
			removalBase,
			diffPolicy: params.diffPolicy,
			placeholderLineages: params.placeholderLineages,
			namesFollow,
			leftOut: scope.leftOut,
			placementListing,
		})
	}

	// what lands in a level the placement adds goes with it, a reference with what it points at
	for (const scope of listPlacementScopes({ firstPlacement, frameInstances, primaryInstances })) {
		await linkPlacementDependencies(sourceQuery, { instances: scope, index })
	}

	const report = assembleReport({
		instances: [...frameInstances, ...primaryInstances],
		templateRoots: frameInstances,
	})
	// a level nothing is decided for is the consumer's to choose before anything is written
	if (placementLevels.some((level) => level.undecided)) report.needsDecisions = true
	// the unit named came with the units linked to it: the report says which it acts on
	if (scope.units.length > 1) report.scopeUnits = scope.units
	return report
}

/**
 * The listing of a first placement of the unit: what it places — its applications, the functions they compose
 * wherever they sit, its standalone functions —, what the references of what travels with it may name, what it leaves
 * out.
 */
async function listUnitPlacement(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		matchKey: MatchKey
		scopeRef: Scl.Ref<TopologyStructuralTag>
		applicationRefs: readonly Scl.Ref<'Application'>[]
		standaloneFunctions: readonly Scl.Ref<'Function'>[]
		leftOut: ReadonlySet<string>
		/** Where each level of the template lands: a reference to a level above the unit names where it landed. */
		placementLevels: readonly PlacementLevel[]
	},
): Promise<PlacementListing> {
	const { sourceQuery, scopeRef, applicationRefs, standaloneFunctions, leftOut } = params
	const unit = await resolveUnitPlacement(sourceQuery, { scopeRef, applicationRefs, leftOut })
	const landingIds = new Set(
		params.placementLevels.map(function sourceIdOf(level) {
			return level.sourceRef.id
		}),
	)
	const landedLevels = await resolveLandedLevels(sourceQuery, {
		primaryRef: scopeRef,
		landsOn: function landsSomewhere(level) {
			return landingIds.has(level.id)
		},
	})
	// what the project holds applying to what the placement lands on, as the apply reads it
	const landings = await resolveFrameLandings(query, {
		sourceQuery,
		placementLevels: params.placementLevels,
		matchKey: params.matchKey,
	})
	const held = await readHeldApplications({
		landings,
		projectQuery: query,
		matchKey: params.matchKey,
	})
	return createPlacementListing(sourceQuery, {
		scope: withLandedLevels({ scope: unit.scope, levels: landedLevels }),
		held,
		landings,
		primaryRefs: [...applicationRefs, ...standaloneFunctions, ...unit.composedRefs],
		leftOut,
		frame: { primaryRef: scopeRef, composedRefs: unit.composedRefs },
	})
}

/**
 * Fold into the placed frame the satellites the placement places that no primary listed: what applies to its levels or
 * their equipment only, what they hold applying to them. The report of the frame is folded in place.
 */
async function foldFrameSatellites(
	query: Core.Query<Config>,
	params: FoldFrameSatellitesParams,
): Promise<void> {
	const { placedFrame } = params
	const frameReport: SatelliteFoldTarget = {
		root: placedFrame.tree,
		groups: placedFrame.groups,
		mappings: placedFrame.mappings,
		referencesNotPlaced: placedFrame.referencesNotPlaced,
	}
	await foldCrossCuttingSatellites(query, {
		sourceQuery: params.sourceQuery,
		primaryRef: params.scopeRef,
		report: frameReport,
		anchor: params.anchor,
		matchKey: params.matchKey,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		scope: params.placementListing.scope,
		placementListing: params.placementListing,
		frame: true,
		leftOut: params.leftOut,
	})
	placedFrame.mappings = frameReport.mappings ?? []
	if (frameReport.referencesNotPlaced)
		placedFrame.referencesNotPlaced = frameReport.referencesNotPlaced
	placedFrame.upToDate = placedFrame.groups.length === 0
}

/**
 * Where a primary is reported: once, from where the template lands — unless the template gained it
 * since its unit was placed: then from the level each instance holds for it, listed for each instance
 * (`placedFor`, the level the instance sits on) when there are several.
 */
async function findPrimaryPlaces(
	query: Core.Query<Config>,
	params: ResolvePrimaryParentsParams,
): Promise<PrimaryPlace[]> {
	const once = [{ parent: params.anchor }]
	if (params.instanceLevelsList.length === 0) return once

	const { gained, places } = await resolvePrimaryParents(query, params)
	if (!gained) return once
	if (places.length > 1) return places
	const [{ parent, placedFor }] = places
	return [{ parent: parent ?? placedFor ?? params.anchor }]
}

/**
 * The report instances of each placement: on a first placement, all of them; on an update, each
 * instance of the unit with the primaries placed in it afresh — those listed for it, and those
 * listed once, which land in the one instance there is.
 */
function listPlacementScopes(params: {
	firstPlacement: boolean
	frameInstances: readonly ReportInstance[]
	primaryInstances: readonly ReportInstance[]
}): ReportInstance[][] {
	const { firstPlacement, frameInstances, primaryInstances } = params
	if (firstPlacement) return [[...frameInstances, ...primaryInstances]]

	const placed = primaryInstances.filter((instance) => !instance.rootRef)
	return frameInstances.map((frameInstance) => [
		frameInstance,
		...placed.filter(
			(instance) => !instance.placedFor || instance.placedFor.id === frameInstance.rootRef?.id,
		),
	])
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

/**
 * Make the removal of each dropped function depend on the removal of the dropped applications composing it: removed
 * while one of them stays, the application would refer to nothing.
 */
async function linkToComposingApplications(
	query: Core.Query<Config>,
	params: { groups: readonly DecisionGroup[] },
): Promise<void> {
	const { groups } = params
	const applicationGroups = groups.filter((group) => group.primary.tagName === 'Application')
	for (const group of groups) {
		const functionRef = group.primary.tagName === 'Function' ? group.primary.instanceRef : undefined
		if (!functionRef) continue
		const functionUuid = await query.any.getAttribute(functionRef, { name: 'uuid' })
		if (!functionUuid) continue
		for (const applicationGroup of applicationGroups) {
			const applicationRef = applicationGroup.primary.instanceRef
			if (!applicationRef) continue
			const composed = await collectComposedFunctionUuids(query, {
				tagName: 'Application',
				id: applicationRef.id ?? '',
			})
			if (composed.has(functionUuid)) group.dependsOn.push(applicationGroup.id)
		}
	}
}
