import { foldCrossCuttingSatellites } from './cross-cutting-satellites'
import { reportFunction } from './report-function'
import { buildReportInstance } from './report-instance'
import { foldSatelliteCompanions } from './satellite-companions'

import { assembleReport, diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { placeFor } from '@/v2019C1/extensions/lifecycle/engine/group'
import { linkPlacementDependencies } from '@/v2019C1/extensions/lifecycle/engine/link-placement-dependencies'
import { describeStandingChoice } from '@/v2019C1/extensions/lifecycle/engine/standing'
import {
	collectForeignScopes,
	findInstancesByTemplateUuid,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance'
import {
	resolveApplicationSatellites,
	resolveComposedFunctions,
} from '@/v2019C1/extensions/lifecycle/layers/application'
import {
	describePlacementMappings,
	findLanding,
	resolvePrimaryPlacement,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import {
	resolveSatelliteMappings,
	toRedirectMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'
import { matchKeyForScenario } from '@/v2019C1/extensions/lifecycle/scenario'

import type { Scl, Config } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	DiffReport,
	InstanceDiff,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { StandingPlacement } from '@/v2019C1/extensions/lifecycle/engine/standing'
import type {
	DecisionMappings,
	ReportMapping,
	ReportPass,
} from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
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
	},
): Promise<DiffReport> {
	const { sourceQuery, applicationRef, scenario, targetInstance, decisionMappings } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(applicationRef)
	const matchKey = matchKeyForScenario(scenario)
	// `instantiate` always places a NEW instance, so it never matches an existing one.
	const matchedApplications =
		scenario === 'instantiate'
			? []
			: await findInstancesByTemplateUuid(query, { tagName: 'Application', sourceUuid, matchKey })
	const applicationInstances = await scopeToTargetInstance(query, {
		instances: matchedApplications,
		targetInstance,
	})

	// a first placement: where the application and its functions land is where the consumer
	// started, or — started above a level one of them was made for — the levels their template says
	const firstPlacement = applicationInstances.length === 0
	const placement =
		firstPlacement && params.resolvePlacement && params.anchor
			? await resolvePrimaryPlacement(query, {
					sourceQuery,
					primaryRefs: [
						applicationRef,
						...(await findComposedFunctionRefs(sourceQuery, applicationRef)),
					],
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
	if (firstPlacement) {
		const instanceDiff = await reportApplicationInstance(query, {
			pass: params.pass,
			sourceQuery,
			applicationRef,
			instance: undefined,
			refsAlwaysAdded: scenario === 'instantiate',
			matchKey,
			decisionMappings,
			anchor,
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
		reportInstances.push(reportInstance)
	} else {
		// an element the instances share (a role) holds one reference per instance: each instance
		// is compared with its own
		const foreignScopes = await collectForeignScopes(query, { instances: matchedApplications })
		for (const instance of applicationInstances) {
			const instanceDiff = await reportApplicationInstance(query, {
				pass: params.pass,
				sourceQuery,
				applicationRef,
				instance,
				refsAlwaysAdded: scenario === 'instantiate',
				matchKey,
				decisionMappings,
				anchor,
				foreignScope: foreignScopes.get(instance.id),
			})
			reportInstances.push(
				await buildReportInstance(query, {
					instanceDiff,
					instance,
					sourceQuery,
					sourceRef: applicationRef,
				}),
			)
		}
	}

	const composedFunctions = await reportComposedFunctions(query, {
		pass: params.pass,
		sourceQuery,
		applicationRef,
		applicationInstances,
		scenario,
		targetInstance,
		decisionMappings,
		anchor,
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
	for (const instances of placements) await linkPlacementDependencies(sourceQuery, { instances })
	// which function an instance stands on, where several qualify: listed with that instance
	for (const choice of composedFunctions.choices) {
		const owner = reportInstances.find(
			(reportInstance) => reportInstance.rootRef?.id === choice.placedFor?.id,
		)
		if (owner) owner.mappings = [...owner.mappings, choice]
	}

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
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		instance: AnyTrackedRecord | undefined
		refsAlwaysAdded?: boolean
		matchKey?: MatchKey
		decisionMappings?: DecisionMappings
		anchor?: Scl.Ref<Scl.ElementsOf>
		/** What belongs to the other instances of the application. */
		foreignScope?: ReadonlySet<string>
		/** What the whole report already listed and named. */
		pass?: ReportPass
	},
): Promise<InstanceDiff> {
	const { sourceQuery, applicationRef, instance } = params
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false

	// application-layer satellites (e.g. a referenced AllocationRole) travel with
	// the application's decision group
	const satelliteRefs = await resolveApplicationSatellites(sourceQuery, { applicationRef })
	const instanceSatelliteRefs = instance
		? await resolveApplicationSatellites(query, {
				applicationRef: { tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>,
			})
		: []

	// where the shared ones land is resolved FIRST: the application's references to an element of
	// the project a source element is mapped onto are the template's references to that element
	const resolvedMappings = await resolveSatelliteMappings(query, {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		decisionMappings: params.decisionMappings,
		matchKey: params.matchKey,
	})
	const redirectMappings = await toRedirectMappings({
		sourceQuery,
		satelliteRefs,
		resolvedMappings,
	})

	const applicationReport = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: applicationRef,
		instanceRootRef: instance,
		matchKey: params.matchKey,
		redirectMappings,
	})

	async function resolveForeignScope(): Promise<ReadonlySet<string>> {
		return params.foreignScope ?? new Set()
	}

	await foldSatelliteCompanions(query, {
		pass: params.pass,
		sourceQuery,
		primaryRef: applicationRef,
		satelliteRefs,
		instanceSatelliteRefs,
		report: applicationReport,
		instanceScopeId: instance?.id,
		refsAlwaysAdded,
		decisionMappings: params.decisionMappings,
		anchor: params.anchor,
		matchKey: params.matchKey,
		resolvedMappings,
		instancePrimaryRef: instance
			? ({ tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>)
			: undefined,
		resolveForeignScope,
	})

	// cross-cutting satellites (Variable / BehaviorDescription) applying to any element
	// in the Application subtree travel with the application group
	await foldCrossCuttingSatellites(query, {
		pass: params.pass,
		sourceQuery,
		primaryRef: applicationRef,
		instancePrimaryRef: instance
			? ({ tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>)
			: undefined,
		report: applicationReport,
		refsAlwaysAdded,
		anchor: params.anchor,
		matchKey: params.matchKey,
		resolveForeignScope,
	})

	return applicationReport
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
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		/** The instances of the application in the project — none on a first placement. */
		applicationInstances: readonly AnyTrackedRecord[]
		scenario?: LifecycleScenario
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		decisionMappings?: DecisionMappings
		anchor?: Scl.Ref<Scl.ElementsOf>
		/** What the whole report already listed and named. */
		pass?: ReportPass
	},
): Promise<{
	instances: ReportInstance[]
	choices: ReportMapping[]
	placements: StandingPlacement[]
}> {
	const { sourceQuery, applicationRef, applicationInstances, scenario, anchor } = params
	const matchKey = matchKeyForScenario(scenario)

	const reportInstances: ReportInstance[] = []
	if (applicationInstances.length === 0) {
		for (const functionRef of await findComposedFunctionRefs(sourceQuery, applicationRef)) {
			reportInstances.push(
				await reportComposedFunction(query, {
					...params,
					functionRef,
					instance: undefined,
					refsAlwaysAdded: scenario === 'instantiate',
				}),
			)
		}
		return { instances: reportInstances, choices: [], placements: [] }
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
			if (choice) choices.push(await describeStandingChoice(query, { child, instance, choice }))
		}
		const reconciled = new Map<string, AnyTrackedRecord>()
		for (const instance of applicationInstances) {
			const standing = standings.get(instance.id)
			if (!standing || standing.kind === 'undecided') continue
			if (standing.kind === 'owned') {
				for (const owned of standing.elements) reconciled.set(owned.id, owned)
			} else if (standing.kind === 'taken') {
				reconciled.set(standing.element.id, standing.element)
			} else {
				const reportInstance = await reportComposedFunction(query, {
					...params,
					functionRef,
					instance: undefined,
					refsAlwaysAdded: true,
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
			reportInstances.push(
				await reportComposedFunction(query, {
					...params,
					functionRef,
					instance: functionInstance,
					refsAlwaysAdded: scenario === 'instantiate',
				}),
			)
		}
	}
	return { instances: reportInstances, choices, placements }
}

/** The report of one composed function: placed afresh (`instance` undefined) or reconciled. */
async function reportComposedFunction(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		instance: AnyTrackedRecord | undefined
		/** The function's references are new whatever the project holds (a function placed afresh). */
		refsAlwaysAdded: boolean
		scenario?: LifecycleScenario
		decisionMappings?: DecisionMappings
		anchor?: Scl.Ref<Scl.ElementsOf>
		pass?: ReportPass
	},
): Promise<ReportInstance> {
	const { sourceQuery, functionRef, instance, scenario } = params
	const instanceDiff = await reportFunction(query, {
		pass: params.pass,
		sourceQuery,
		functionRef,
		instance,
		refsAlwaysAdded: params.refsAlwaysAdded,
		matchKey: matchKeyForScenario(scenario),
		decisionMappings: params.decisionMappings,
		anchor: params.anchor,
	})
	return buildReportInstance(query, { instanceDiff, instance, sourceQuery, sourceRef: functionRef })
}
