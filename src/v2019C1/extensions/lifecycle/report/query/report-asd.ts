import { foldCrossCuttingSatellites } from './cross-cutting-satellites'
import { reportFunction } from './report-function'
import { buildReportInstance } from './report-instance'
import { foldSatelliteCompanions } from './satellite-companions'

import { assembleReport, diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { collectComposedFunctionUuids } from '@/v2019C1/extensions/lifecycle/instance'
import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import { resolveApplicationSatellites } from '@/v2019C1/extensions/lifecycle/layers/application'

import type { Scl, Config } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	DiffReport,
	InstanceDiff,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
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
	},
): Promise<DiffReport> {
	const { sourceQuery, applicationRef, scenario } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(applicationRef)
	// `instantiate` always places a NEW instance, so it never matches an existing one.
	const applicationInstances =
		scenario === 'instantiate'
			? []
			: await findInstancesByTemplateUuid(query, { tagName: 'Application', sourceUuid })

	const reportInstances: ReportInstance[] = []
	if (applicationInstances.length === 0) {
		const instanceDiff = await reportApplicationInstance(query, {
			sourceQuery,
			applicationRef,
			instance: undefined,
			refsAlwaysAdded: scenario === 'instantiate',
		})
		reportInstances.push(
			await buildReportInstance(query, {
				instanceDiff,
				instance: undefined,
				sourceQuery,
				sourceRef: applicationRef,
			}),
		)
	} else {
		for (const instance of applicationInstances) {
			const instanceDiff = await reportApplicationInstance(query, {
				sourceQuery,
				applicationRef,
				instance,
				refsAlwaysAdded: scenario === 'instantiate',
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
	})

	return assembleReport([...reportInstances, ...functionInstances])
}

/** Diff one Application instance and fold its (layer + cross-cutting) satellites. */
async function reportApplicationInstance(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		instance: AnyTrackedRecord | undefined
		refsAlwaysAdded?: boolean
	},
): Promise<InstanceDiff> {
	const { sourceQuery, applicationRef, instance } = params
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false

	const applicationReport = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: applicationRef,
		instanceRootRef: instance,
	})

	// application-layer satellites (e.g. a referenced AllocationRole) travel with
	// the application's decision group
	const satelliteRefs = await resolveApplicationSatellites(sourceQuery, { applicationRef })
	const instanceSatelliteRefs = instance
		? await resolveApplicationSatellites(query, {
				applicationRef: { tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>,
			})
		: []
	await foldSatelliteCompanions(query, {
		sourceQuery,
		primaryRef: applicationRef,
		satelliteRefs,
		instanceSatelliteRefs,
		report: applicationReport,
		instanceScopeId: instance?.id,
		refsAlwaysAdded,
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
	},
): Promise<ReportInstance[]> {
	const { sourceQuery, applicationRef, scenario } = params
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
		const functionInstances =
			scenario === 'instantiate'
				? []
				: await findInstancesByTemplateUuid(query, {
						tagName: 'Function',
						sourceUuid: functionUuid,
					})
		if (functionInstances.length === 0) {
			const instanceDiff = await reportFunction(query, {
				sourceQuery,
				functionRef,
				instance: undefined,
				refsAlwaysAdded: scenario === 'instantiate',
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
