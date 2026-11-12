import { foldCrossCuttingSatellites } from './cross-cutting-satellites'
import { createPlacementListing } from './placement-listing'
import { reportFunction } from './report-function'
import { buildReportInstance } from './report-instance'
import { reportSharedFunctions } from './report-shared-functions'
import { foldSatelliteCompanions } from './satellite-companions'

import { toRef } from '@dialecte/core/helpers'

import { readSatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { readHeldApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications'
import { assembleReport, diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { addDroppedGroups, placeFor } from '@/v2019C1/extensions/lifecycle/engine/group'
import { linkPlacementDependencies } from '@/v2019C1/extensions/lifecycle/engine/link-placement-dependencies'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { describeStandingChoice } from '@/v2019C1/extensions/lifecycle/engine/standing'
import {
	collectForeignScopes,
	findByOwnUuid,
	findInstancesByTemplateUuid,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import {
	findDroppedComposedFunctions,
	NO_VARIANT_SELECTION,
	readVariantSelection,
	readVariantTemplate,
	resolveApplicationSatellites,
	resolveApplicationScope,
	resolveComposedFunctions,
	resolveRoleSatellites,
	sharedSelection,
	withoutHeldSatellites,
} from '@/v2019C1/extensions/lifecycle/layers/application'
import {
	describePlacementMappings,
	findLanding,
	landAt,
	readTemplateLevels,
	landLevelsByTag,
	resolveLandedLevels,
	resolvePrimaryPlacement,
	withLandedLevels,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import {
	resolveSatelliteMappings,
	toRedirectMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'

import type { PlacementListing } from './placement-listing.types'
import type { ReportedApplicationInstance } from './report-asd.types'
import type {
	ReportedSharedFunctions,
	ReportSharedFunctionsParams,
} from './report-shared-functions.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SharedFunctions } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
import type {
	DecisionGroup,
	DiffReport,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { StandingPlacement } from '@/v2019C1/extensions/lifecycle/engine/standing'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type { PlacementLevel, TemplateLevel } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type {
	DecisionMappings,
	ReportMapping,
	ReportPass,
} from '@/v2019C1/extensions/lifecycle/mapping'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey, ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Report (read-only) what `update.fromAsd` would change: the **application
 * layer** (the `Application` subtree) PLUS the **function-layer cascade** (each
 * composed Function the ASD references, mirroring the apply cascade). The
 * per-layer reports are merged into one — `groups` covers both layers, so the
 * full-track surface is complete. Fast/full classification as in {@link reportFsd}.
 *
 * The standard permits several instances of one ASD template under one anchor, so
 * EVERY Application instance AND every composed-Function instance is diffed; their
 * groups (each tagged with its `instanceScopeId`) are merged, and the decision
 * layer targets a subset (multi-instance, Part C).
 */
export async function reportAsd(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		scenario?: LifecycleScenario
		/** Placed afresh by a larger operation: a new instance whatever the project holds. */
		placesFresh?: boolean
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		/** The consumer's choices for the shared elements the application refers to. */
		decisionMappings?: DecisionMappings
		/** The project element the application is placed under. */
		anchor?: Scl.Ref<Scl.ElementsOf>
		/**
		 * The application is placed by this operation alone (an ASD): started above a level the
		 * application or one of its functions was made for, each lands on the level its template says.
		 * Left out when the caller already resolved where they land (a topology scope placing its own
		 * applications).
		 */
		resolvePlacement?: boolean
		/** What the whole report already listed and named. */
		pass?: ReportPass
		/**
		 * What tells an element the source dropped from one the project added, read once for the whole report.
		 * Default: the scenario's, a fork given no previous revision.
		 */
		removalBase?: RemovalBase
		/** Whether a first placement stands on a function another application placed there: see `Resolution.sharedFunctions`. */
		sharedFunctions?: SharedFunctions
		/** What the consumer's resolution tells the diff, read once: see `DiffPolicy`. */
		diffPolicy: DiffPolicy
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
		/**
		 * On a first placement, the larger one it is part of (a unit of a substation template): see `PlacementListing`.
		 * Default: the application's own, with the functions it composes.
		 */
		placementListing?: PlacementListing
		/** The satellites of the template, read once by the larger report it is part of. Default: the listing's, or read. */
		index?: SatelliteIndex
	},
): Promise<DiffReport> {
	const { sourceQuery, applicationRef, scenario, targetInstance, decisionMappings } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(applicationRef)
	const policy = scenarioPolicy({ scenario, placesFresh: params.placesFresh })
	const { matchKey, namesFollow } = policy
	const removalBase = params.removalBase ?? (await resolveRemovalBase({ policy, sourceQuery }))
	// a new instance is placed whatever the project holds: no existing one is matched
	const matchedApplications = policy.matchesInstances
		? await findInstancesByTemplateUuid(query, { tagName: 'Application', sourceUuid, matchKey })
		: []
	const applicationInstances = await scopeToTargetInstance(query, {
		instances: matchedApplications,
		targetInstance,
	})

	// placed keeping the file's uuids: an application of the project already carrying its uuid is its instance,
	// wherever it sits — reported as the update of that instance, as the update reconciles it, even outside
	// `targetInstance`: a uuid names one element of a file, a second is never placed beside it
	if (applicationInstances.length === 0 && policy.placementIdentity === 'keep') {
		const owned = await findByOwnUuid(query, { tagNames: ['Application'], uuid: sourceUuid })
		if (owned.length > 0) {
			return reportAsd(query, { ...params, placesFresh: false, targetInstance: undefined })
		}
	}

	// a first placement: where the application and its functions land is where the consumer
	// started, or — started above a level one of them was made for — the levels their template says
	// the template's levels, read once for every instance and function this report lists
	const templateLevels = await readTemplateLevels(sourceQuery)
	const firstPlacement = applicationInstances.length === 0
	const composedFunctionRefs = firstPlacement
		? await findComposedFunctionRefs(sourceQuery, applicationRef)
		: []
	const placement =
		firstPlacement && params.resolvePlacement && params.anchor
			? await resolvePrimaryPlacement(query, {
					sourceQuery,
					primaryRefs: [applicationRef, ...composedFunctionRefs],
					anchor: params.anchor,
					decisionMappings,
				})
			: { levels: [] }
	const deepestLevel = placement.levels.at(-1)
	const anchor =
		(deepestLevel &&
			findLanding({ placementLevels: placement.levels, levelId: deepestLevel.sourceRef.id })) ||
		params.anchor

	const reportInstances: ReportInstance[] = []
	// what each instance's selection of variants leaves out of the template, by instance record id
	const selections = new Map<string, VariantSelection>()
	// a first placement merging the functions applications share: what the application stands on, read once for it and
	// for the functions it composes
	const shared =
		firstPlacement && params.sharedFunctions === 'merge'
			? await readSharedFunctions(query, {
					sourceQuery,
					applicationRef,
					anchor,
					decisionMappings,
					matchKey,
				})
			: undefined
	// a first placement places what applies to the application and the functions it composes, and what its roles refer
	// to, once
	const placementListing = firstPlacement
		? (params.placementListing ??
			(await listApplicationPlacement(query, {
				sourceQuery,
				applicationRef,
				composedFunctionRefs,
				anchor,
				placementLevels: placement.levels,
				placedFunctionRefs: shared?.placed,
				stoodOn: shared?.taken,
				matchKey,
			})))
		: undefined
	if (firstPlacement) {
		const { instanceDiff, satellitesNotPlaced } = await reportApplicationInstance(query, {
			templateLevels,
			placementListing,
			pass: params.pass,
			sourceQuery,
			applicationRef,
			instance: undefined,
			matchKey,
			decisionMappings,
			anchor,
			removalBase,
			diffPolicy: params.diffPolicy,
			placeholderLineages: params.placeholderLineages,
			namesFollow,
			stoodOn: shared?.taken,
		})
		const reportInstance = await buildReportInstance(query, {
			instanceDiff,
			instance: undefined,
			sourceQuery,
			sourceRef: applicationRef,
		})
		// the levels are listed first, the shared elements follow
		const placementMappings = await describePlacementMappings(query, { levels: placement.levels })
		reportInstance.mappings = [...placementMappings, ...reportInstance.mappings]
		if (satellitesNotPlaced.length > 0) reportInstance.satellitesNotPlaced = satellitesNotPlaced
		reportInstances.push(reportInstance)
	} else {
		// an element the instances share (a role) holds one reference per instance: each instance
		// is compared with its own
		const foreignScopes = await collectForeignScopes(query, { instances: matchedApplications })
		// the template read once for the selections of its instances
		const template = await readVariantTemplate(sourceQuery, { applicationRef, namesFollow })
		for (const instance of applicationInstances) {
			const selection = await readVariantSelection(query, { template, instance, matchKey })
			selections.set(instance.id, selection)
			const { instanceDiff } = await reportApplicationInstance(query, {
				templateLevels,
				pass: params.pass,
				sourceQuery,
				applicationRef,
				instance,
				matchKey,
				decisionMappings,
				anchor,
				foreignScope: foreignScopes.get(instance.id),
				removalBase,
				diffPolicy: params.diffPolicy,
				placeholderLineages: params.placeholderLineages,
				namesFollow,
				selection,
			})
			const reportInstance = await buildReportInstance(query, {
				instanceDiff,
				instance,
				sourceQuery,
				sourceRef: applicationRef,
			})
			if (selection.variantsNotSelected.length > 0)
				reportInstance.variantsNotSelected = selection.variantsNotSelected
			reportInstances.push(reportInstance)
		}
	}

	const composedFunctions = await reportComposedFunctions(query, {
		templateLevels,
		placementListing,
		pass: params.pass,
		sourceQuery,
		applicationRef,
		applicationInstances,
		policy,
		targetInstance,
		decisionMappings,
		anchor,
		removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow,
		selections,
		shared,
	})

	// what the groups of each placement depend on: on a first placement, the application on the
	// functions it composes; on an update, what an instance gains on the functions placed for it
	const placements = firstPlacement
		? [[...reportInstances, ...composedFunctions.instances]]
		: reportInstances.map((referrer) => [
				referrer,
				...composedFunctions.placements
					.filter((placement) => placement.placedFor === referrer.rootRef?.id)
					.map((placement) => placement.reportInstance),
			])
	// the satellites of the template, read once for every placement
	const index = placementListing?.index ?? params.index ?? (await readSatelliteIndex(sourceQuery))
	for (const instances of placements)
		await linkPlacementDependencies(sourceQuery, { instances, index })
	// which function an instance stands on, where several qualify: listed with that instance
	for (const choice of composedFunctions.choices) {
		const owner = reportInstances.find(
			(reportInstance) => reportInstance.rootRef?.id === choice.placedFor?.id,
		)
		if (owner) owner.mappings = [...owner.mappings, choice]
	}
	// the functions an instance composes that the newer application no longer does: each removed after the
	// reference to it
	const droppedByInstance = await findDroppedComposedFunctions(query, {
		sourceQuery,
		applicationRef,
		instances: applicationInstances,
		matchKey,
		removalBase,
	})
	const droppedGroups: DecisionGroup[] = []
	for (const reportInstance of reportInstances) {
		const dropped = droppedByInstance.get(reportInstance.rootRef?.id ?? '') ?? []
		droppedGroups.push(...addDroppedGroups({ reportInstance, dropped }))
	}
	// the references to it may sit in several instances: each removal comes first
	const referenceGroups = reportInstances.flatMap((reportInstance) => reportInstance.groups)
	await linkToReferenceRemovals(query, { groups: droppedGroups, referenceGroups })

	const report = assembleReport({
		instances: [...reportInstances, ...composedFunctions.instances],
		templateRoots: reportInstances,
	})
	report.offLevel = placement.offLevel
	// a level nothing is decided for is the consumer's to choose before anything is written
	if (placement.levels.some((level) => level.undecided)) report.needsDecisions = true
	return report
}

/** Diff one Application instance and fold its (layer + cross-cutting) satellites. */
async function reportApplicationInstance(
	query: Core.Query<Config>,
	params: {
		/** The template's levels, read once per report: see `readTemplateLevels`. */
		templateLevels: readonly TemplateLevel[]
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		instance: AnyTrackedRecord | undefined
		matchKey?: MatchKey
		decisionMappings?: DecisionMappings
		anchor?: Scl.Ref<Scl.ElementsOf>
		/** What belongs to the other instances of the application. */
		foreignScope?: ReadonlySet<string>
		/** What the whole report already listed and named. */
		pass?: ReportPass
		removalBase: RemovalBase
		/** What the consumer's resolution tells the diff, read once: see `DiffPolicy`. */
		diffPolicy: DiffPolicy
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
		/** Whose names an update follows: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/** What the instance's selection of functional variants leaves out of the template. */
		selection?: VariantSelection
		/** On a first placement, the functions it composes that it stands on: a reference to one names that function. */
		stoodOn?: readonly RedirectMapping[]
		/** The first placement it is part of: see `PlacementListing`. */
		placementListing?: PlacementListing
	},
): Promise<ReportedApplicationInstance> {
	const { sourceQuery, applicationRef, instance } = params

	// application-layer satellites (e.g. a referenced AllocationRole) travel with
	// the application's decision group
	const satelliteRefs = await resolveApplicationSatellites(sourceQuery, {
		applicationRef,
		leftOut: params.selection?.within,
	})
	const instanceSatelliteRefs = instance
		? await resolveApplicationSatellites(query, {
				applicationRef: { tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>,
			})
		: []

	// where the template's levels land: a placement's, as the apply reads them, else where the instance (or the anchor) is
	const landings =
		params.placementListing?.landings ??
		(await landAt(query, { levels: params.templateLevels, at: instance ?? params.anchor }))
	// where the shared ones land is resolved FIRST: the application's references to an element of
	// the project a source element is mapped onto are the template's references to that element
	const resolvedMappings = await resolveSatelliteMappings(query, {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		decisionMappings: params.decisionMappings,
		matchKey: params.matchKey,
		landings,
	})
	const redirectMappings = await toRedirectMappings({
		sourceQuery,
		satelliteRefs,
		resolvedMappings,
	})

	// what the references of its satellites may name: what the placement places — by default the application and the
	// functions it composes, but what the selection leaves out
	const scope =
		params.placementListing?.scope ??
		(await resolveApplicationScope(sourceQuery, {
			applicationRef,
			leftOut: params.selection?.leftOut,
		}))
	// what its roles refer to, on a first placement: placed whole, but what another clone of the placement places and
	// what a function stood on holds; a variable applying to nothing reached is not placed, nor the references to it
	const roleSatellites = instance
		? undefined
		: await resolveRoleSatellites(sourceQuery, {
				applicationRef,
				scope,
				carriedIds: params.placementListing?.satellites ?? new Set(),
				carried: params.placementListing?.carried,
				held: params.placementListing?.held,
				index: params.placementListing?.index,
				stoodOn: {
					functions: params.stoodOn ?? [],
					projectQuery: query,
					matchKey: params.matchKey ?? 'templateUuid',
				},
			})
	const notSelected = new Set([
		...(params.selection?.leftOut ?? []),
		...(roleSatellites?.unplacedReferenceIds ?? []),
	])
	const applicationReport = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: applicationRef,
		instanceRootRef: instance,
		matchKey: params.matchKey,
		redirectMappings,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		notSelected,
	})

	async function resolveForeignScope(): Promise<ReadonlySet<string>> {
		return params.foreignScope ?? new Set()
	}

	await foldSatelliteCompanions(query, {
		scope,
		landings,
		redirectMappings: params.stoodOn,
		pass: params.pass,
		sourceQuery,
		primaryRef: applicationRef,
		satelliteRefs,
		instanceSatelliteRefs,
		report: applicationReport,
		instanceScopeId: instance?.id,
		decisionMappings: params.decisionMappings,
		// a role an update adds is written where its instance sits: described, and its candidates listed, from there
		anchor: instance ? (toRef(instance) as Scl.Ref<Scl.ElementsOf>) : params.anchor,
		matchKey: params.matchKey,
		resolvedMappings,
		instancePrimaryRef: instance
			? ({ tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>)
			: undefined,
		resolveForeignScope,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		notSelected: params.selection?.leftOut,
	})

	// cross-cutting satellites (Variable / BehaviorDescription) applying to any element
	// in the Application subtree travel with the application group, and, placed, those its roles refer to
	const referencedRefs = roleSatellites
		? await withoutHeldSatellites(query, { roleSatellites })
		: []
	await foldCrossCuttingSatellites(query, {
		referencedRefs,
		referencedLeaveOut: roleSatellites?.leaveOut,
		scope,
		placementListing: params.placementListing,
		pass: params.pass,
		sourceQuery,
		primaryRef: applicationRef,
		instancePrimaryRef: instance
			? ({ tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>)
			: undefined,
		report: applicationReport,
		anchor: params.anchor,
		matchKey: params.matchKey,
		resolveForeignScope,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		selection: params.selection,
	})

	return { instanceDiff: applicationReport, satellitesNotPlaced: roleSatellites?.unplaced ?? [] }
}

/**
 * The listing of the first placement of an application on its own: the application and the functions it composes, what
 * the references of what travels with it may name — what it places, and the levels of the template it lands on (those
 * of the structure where it lands, and the ones its placement adds).
 */
async function listApplicationPlacement(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		composedFunctionRefs: readonly Scl.Ref<'Function'>[]
		/** Where the application lands. */
		anchor: Scl.Ref<Scl.ElementsOf> | undefined
		placementLevels: readonly PlacementLevel[]
		/** Merging shared functions, those it places (not those it stands on). Default: every function it composes. */
		placedFunctionRefs?: readonly Scl.Ref<'Function'>[]
		/** Merging shared functions, those it stands on: a reference to one names the project's function. */
		stoodOn?: readonly RedirectMapping[]
		matchKey: MatchKey
	},
): Promise<PlacementListing> {
	const { sourceQuery, applicationRef, composedFunctionRefs, anchor, placementLevels } = params
	const structure = anchor ? await resolveTargetStructure(query, anchor) : {}
	const landedTags = new Set<string>(
		placementLevels.map(function tagOf(level) {
			return level.sourceRef.tagName
		}),
	)
	for (const tagName of Object.keys(structure)) landedTags.add(tagName)
	const landedLevels = await resolveLandedLevels(sourceQuery, {
		primaryRef: applicationRef,
		landsOn: function landsWhereItLands(level) {
			return landedTags.has(level.tagName)
		},
	})
	const applicationScope = await resolveApplicationScope(sourceQuery, { applicationRef })
	const scope = withLandedLevels({ scope: applicationScope, levels: landedLevels })
	// a function stood on is no primary of this placement: what applies to it is no primary's to list
	const placedFunctionIds = new Set(
		(params.placedFunctionRefs ?? composedFunctionRefs).map(function idOf(functionRef) {
			return functionRef.id
		}),
	)
	// each landed level onto the project's element of its tag where the application lands (a level its placement maps
	// onto an element of the project moved the anchor there; one it creates lands on nothing the project holds)
	const landings = landedLevels.flatMap(function landingOf(level): RedirectMapping[] {
		const target = structure[level.tagName as keyof typeof structure]
		return target
			? [{ sourceUuid: level.uuid, target: toRef(target) as Scl.Ref<Scl.ElementsOf> }]
			: []
	})
	// what the project holds applying to the levels it lands on and to the functions it stands on
	const held = await readHeldApplications({
		landings: [...landings, ...(params.stoodOn ?? [])],
		projectQuery: query,
		matchKey: params.matchKey,
	})
	// where a shared element of the template is found by name: each level of the template, by its tag, onto the
	// structure where the application lands, as the apply places what they hold; a level the placement creates holds none
	const created = new Set(
		placementLevels
			.filter(function isCreated(level) {
				return !level.resolved.existing
			})
			.map(function tagOf(level) {
				return level.sourceRef.tagName
			}),
	)
	const sharedLandings = await landLevelsByTag(sourceQuery, { structure, created })
	return createPlacementListing(sourceQuery, {
		scope,
		held,
		landings: sharedLandings,
		primaryRefs: [applicationRef, ...composedFunctionRefs],
		stoodOnIds: new Set(
			composedFunctionRefs
				.filter(function isStoodOn(functionRef) {
					return !placedFunctionIds.has(functionRef.id)
				})
				.map(function idOf(functionRef) {
					return functionRef.id
				}),
		),
	})
}

/**
 * One {@link ReportInstance} per function the update writes for what the application composes. On a
 * first placement, each composed function is placed. Otherwise what stands for each function, per
 * instance of the application, is the update's own answer ({@link resolveComposedFunctions}): a
 * function an instance owns, takes, or no instance stands on where the consumer started is
 * reconciled; a function placed for an instance is a first placement made for it — listed per
 * instance when there are several. Where several functions qualify for an instance, which one it
 * stands on is a choice listed for that instance (`choices`); nothing is placed for it until made.
 */
async function reportComposedFunctions(
	query: Core.Query<Config>,
	params: {
		/** The template's levels, read once per report: see `readTemplateLevels`. */
		templateLevels: readonly TemplateLevel[]
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		/** The instances of the application in the project — none on a first placement. */
		applicationInstances: readonly AnyTrackedRecord[]
		/** The application's policy: the functions it composes are reported under it. */
		policy: ScenarioPolicy
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		decisionMappings?: DecisionMappings
		anchor?: Scl.Ref<Scl.ElementsOf>
		/** What the whole report already listed and named. */
		pass?: ReportPass
		removalBase: RemovalBase
		/** What the consumer's resolution tells the diff, read once: see `DiffPolicy`. */
		diffPolicy: DiffPolicy
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
		/** Whose names an update follows: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/** What each instance of the application's selection of variants leaves out, by instance record id. */
		selections: ReadonlyMap<string, VariantSelection>
		/** On a first placement merging shared functions, what the application stands on and what it places. */
		shared?: ReportedSharedFunctions
		/** On a first placement, the one the functions are part of: see `PlacementListing`. */
		placementListing?: PlacementListing
	},
): Promise<{
	instances: ReportInstance[]
	choices: ReportMapping[]
	placements: StandingPlacement[]
}> {
	const { sourceQuery, applicationRef, applicationInstances, policy, anchor } = params
	const { matchKey } = policy

	const reportInstances: ReportInstance[] = []
	if (applicationInstances.length === 0) {
		// a function stood on is listed as the mapping it is; the others are placed — one another application of the
		// placement composes too once, with the first
		const composed = await findComposedFunctionRefs(sourceQuery, applicationRef)
		const placed = params.shared?.placed ?? composed
		const listedFunctions = params.placementListing?.functions
		for (const functionRef of placed) {
			if (listedFunctions?.has(functionRef.id)) continue
			listedFunctions?.add(functionRef.id)
			const reportInstance = await reportComposedFunction(query, {
				...params,
				functionRef,
				instance: undefined,
			})
			reportInstances.push(reportInstance)
		}
		return { instances: reportInstances, choices: params.shared?.mappings ?? [], placements: [] }
	}

	const composedFunctions = await resolveComposedFunctions(query, {
		sourceQuery,
		applicationRef,
		applicationInstances,
		anchor,
		matchKey,
		decisionMappings: params.decisionMappings,
	})
	const choices: ReportMapping[] = []
	const placements: StandingPlacement[] = []
	for (const { child, standings, choices: instanceChoices, unclaimed } of composedFunctions) {
		const functionRef = child.ref as Scl.Ref<'Function'>
		for (const instance of applicationInstances) {
			const choice = instanceChoices.get(instance.id)
			if (!choice) continue
			const standingChoice = await describeStandingChoice(query, { child, instance, choice })
			choices.push(standingChoice)
		}
		const reconciled = new Map<string, AnyTrackedRecord>()
		// the selections of the instances of the application standing on each function of the project
		const standers = new Map<string, VariantSelection[]>()
		for (const instance of applicationInstances) {
			const standing = standings.get(instance.id)
			if (!standing || standing.kind === 'undecided') continue
			const selection = params.selections.get(instance.id)
			if (standing.kind === 'owned') {
				for (const owned of standing.elements) {
					reconciled.set(owned.id, owned)
					standOn({ standers, functionId: owned.id, selection })
				}
			} else if (standing.kind === 'taken') {
				reconciled.set(standing.element.id, standing.element)
				standOn({ standers, functionId: standing.element.id, selection })
			} else if (!selection?.leftOut.has(functionRef.id)) {
				// a function the template gained that the instance's selection leaves out is not placed for it
				const reportInstance = await reportComposedFunction(query, {
					...params,
					functionRef,
					instance: undefined,
					anchor: standing.level,
				})
				// placed for each instance of the application: listed, and decided, per instance
				if (applicationInstances.length > 1)
					placeFor({ instance: reportInstance, placedFor: instance })
				reportInstances.push(reportInstance)
				placements.push({ placedFor: instance.id, reportInstance })
			}
		}
		for (const unowned of unclaimed) reconciled.set(unowned.id, unowned)

		const scoped = await scopeToTargetInstance(query, {
			instances: [...reconciled.values()],
			targetInstance: params.targetInstance,
		})
		for (const functionInstance of scoped) {
			const reportInstance = await reportComposedFunction(query, {
				...params,
				functionRef,
				instance: functionInstance,
				// a function several instances compose leaves out only what none of them uses
				selection: sharedSelection(standers.get(functionInstance.id) ?? []),
			})
			reportInstances.push(reportInstance)
		}
	}
	return { instances: reportInstances, choices, placements }
}

/** The report of one composed function: placed afresh (`instance` undefined) or reconciled. */
async function reportComposedFunction(
	query: Core.Query<Config>,
	params: {
		/** The template's levels, read once per report: see `readTemplateLevels`. */
		templateLevels: readonly TemplateLevel[]
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		instance: AnyTrackedRecord | undefined
		/** The function's references are new whatever the project holds (a function placed afresh). */
		policy: ScenarioPolicy
		decisionMappings?: DecisionMappings
		anchor?: Scl.Ref<Scl.ElementsOf>
		pass?: ReportPass
		removalBase: RemovalBase
		/** What the consumer's resolution tells the diff, read once: see `DiffPolicy`. */
		diffPolicy: DiffPolicy
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
		/** Whose names an update follows: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/** What the selection of variants of the instances composing it leaves out. */
		selection?: VariantSelection
		/** On a first placement, the one it is part of: see `PlacementListing`. */
		placementListing?: PlacementListing
	},
): Promise<ReportInstance> {
	const { sourceQuery, functionRef, instance, policy } = params
	const instanceDiff = await reportFunction(query, {
		templateLevels: params.templateLevels,
		placementListing: params.placementListing,
		pass: params.pass,
		sourceQuery,
		functionRef,
		instance,
		matchKey: policy.matchKey,
		decisionMappings: params.decisionMappings,
		anchor: params.anchor,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		selection: params.selection,
	})
	return buildReportInstance(query, { instanceDiff, instance, sourceQuery, sourceRef: functionRef })
}

/**
 * Make the removal of each dropped function depend on the removals of the references to it: each group listing an
 * instance's `FunctionRef` to that function as removed, whether as its change or among its companions.
 */
async function linkToReferenceRemovals(
	query: Core.Query<Config>,
	params: { groups: readonly DecisionGroup[]; referenceGroups: readonly DecisionGroup[] },
): Promise<void> {
	const { groups, referenceGroups } = params
	for (const group of groups) {
		const functionRef = group.primary.instanceRef
		if (!functionRef) continue
		const functionUuid = await query.any.getAttribute(functionRef, { name: 'uuid' })
		for (const candidate of referenceGroups) {
			if (candidate === group) continue
			const removesReference = await removesReferenceTo(query, { group: candidate, functionUuid })
			if (removesReference && !group.dependsOn.includes(candidate.id))
				group.dependsOn.push(candidate.id)
		}
	}
}

/** Whether a group removes a `FunctionRef` naming a function by its uuid. */
async function removesReferenceTo(
	query: Core.Query<Config>,
	params: { group: DecisionGroup; functionUuid: string | undefined },
): Promise<boolean> {
	const { group, functionUuid } = params
	if (!functionUuid) return false
	for (const node of [group.primary, ...group.companions]) {
		if (node.change !== 'removed' || node.tagName !== 'FunctionRef' || !node.instanceRef) continue
		const named = await query.any.getAttribute(node.instanceRef, { name: 'functionUuid' })
		if (named === functionUuid) return true
	}
	return false
}

/**
 * Record that an instance of the application stands on a function of the project, with its selection of variants:
 * none when it selected nothing, so nothing is left out of a function it shares.
 */
function standOn(params: {
	standers: Map<string, VariantSelection[]>
	functionId: string
	selection: VariantSelection | undefined
}): void {
	const { standers, functionId, selection } = params
	const listed = standers.get(functionId) ?? []
	listed.push(selection ?? NO_VARIANT_SELECTION)
	standers.set(functionId, listed)
}

/** What a first placement merging shared functions stands on, for the functions the application composes. */
async function readSharedFunctions(
	query: Core.Query<Config>,
	params: Omit<ReportSharedFunctionsParams, 'functionRefs'>,
): Promise<ReportedSharedFunctions> {
	const functionRefs = await findComposedFunctionRefs(params.sourceQuery, params.applicationRef)
	return reportSharedFunctions(query, { ...params, functionRefs })
}
