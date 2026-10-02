import { foldCrossCuttingSatellites } from './cross-cutting-satellites'
import { reportFunction } from './report-function'
import { buildReportInstance } from './report-instance'
import { foldSatelliteCompanions } from './satellite-companions'

import { assembleReport, diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	collectComposedFunctionUuids,
	findInstancesByTemplateUuid,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance'
import { resolveApplicationSatellites } from '@/v2019C1/extensions/lifecycle/layers/application'
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
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
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
		for (const instance of applicationInstances) {
			const instanceDiff = await reportApplicationInstance(query, {
				sourceQuery,
				applicationRef,
				instance,
				refsAlwaysAdded: scenario === 'instantiate',
				matchKey,
				decisionMappings,
				anchor,
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

	const functionInstances = await reportComposedFunctions(query, {
		sourceQuery,
		applicationRef,
		scenario,
		targetInstance,
		decisionMappings,
		anchor,
	})

	const report = assembleReport([...reportInstances, ...functionInstances])
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

	await foldSatelliteCompanions(query, {
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
	})

	// cross-cutting satellites (Variable / BehaviorDescription) applying to any element
	// in the Application subtree travel with the application group
	await foldCrossCuttingSatellites(query, {
		sourceQuery,
		primaryRef: applicationRef,
		instancePrimaryRef: instance
			? ({ tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>)
			: undefined,
		report: applicationReport,
		refsAlwaysAdded,
		anchor: params.anchor,
		matchKey: params.matchKey,
	})

	return applicationReport
}

/** One {@link ReportInstance} per composed Function INSTANCE (found globally by `templateUuid`). */
async function reportComposedFunctions(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		scenario?: LifecycleScenario
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		decisionMappings?: DecisionMappings
		anchor?: Scl.Ref<Scl.ElementsOf>
	},
): Promise<ReportInstance[]> {
	const { sourceQuery, applicationRef, scenario, targetInstance, decisionMappings, anchor } = params
	const matchKey = matchKeyForScenario(scenario)
	const functionUuids = await collectComposedFunctionUuids(sourceQuery, applicationRef)

	const reportInstances: ReportInstance[] = []
	for (const functionUuid of functionUuids) {
		const [sourceFunction] = await sourceQuery.any.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: functionUuid },
		})
		if (!sourceFunction) continue

		const functionRef = { tagName: 'Function', id: sourceFunction.id } as Scl.Ref<'Function'>
		// `instantiate` always places NEW composed-function instances too.
		const matchedFunctions =
			scenario === 'instantiate'
				? []
				: await findInstancesByTemplateUuid(query, {
						tagName: 'Function',
						sourceUuid: functionUuid,
						matchKey,
					})
		const functionInstances = await scopeToTargetInstance(query, {
			instances: matchedFunctions,
			targetInstance,
		})
		if (functionInstances.length === 0) {
			const instanceDiff = await reportFunction(query, {
				sourceQuery,
				functionRef,
				instance: undefined,
				refsAlwaysAdded: scenario === 'instantiate',
				matchKey,
				decisionMappings,
				anchor,
			})
			reportInstances.push(
				await buildReportInstance(query, {
					instanceDiff,
					instance: undefined,
					sourceQuery,
					sourceRef: functionRef,
				}),
			)
			continue
		}
		for (const functionInstance of functionInstances) {
			const instanceDiff = await reportFunction(query, {
				sourceQuery,
				functionRef,
				instance: functionInstance,
				refsAlwaysAdded: scenario === 'instantiate',
				matchKey,
				decisionMappings,
				anchor,
			})
			reportInstances.push(
				await buildReportInstance(query, {
					instanceDiff,
					instance: functionInstance,
					sourceQuery,
					sourceRef: functionRef,
				}),
			)
		}
	}
	return reportInstances
}
