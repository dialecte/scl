import { collectComposedFunctionUuids } from '../composed-functions'
import { findInstancesByTemplateUuid } from '../find-instance'
import { foldCrossCuttingSatellites } from './cross-cutting-satellites'
import { reportFunction } from './report-function'
import { foldSatelliteCompanions } from './satellite-companions'

import { diff, mergeReports } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { resolveApplicationSatellites } from '@/v2019C1/extensions/lifecycle/layers/application'
import { extractElementTitle } from '@/v2019C1/extensions/presentation/query'

import type { Scl, Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
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
	},
): Promise<DiffReport> {
	const { sourceQuery, applicationRef } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(applicationRef)
	const applicationInstances = await findInstancesByTemplateUuid(query, {
		tagName: 'Application',
		sourceUuid,
	})

	const reports: DiffReport[] = []
	if (applicationInstances.length === 0) {
		// first-time = fast track; the whole application is added
		reports.push(
			await reportApplicationInstance(query, { sourceQuery, applicationRef, instance: undefined }),
		)
	} else {
		for (const instance of applicationInstances) {
			reports.push(
				await reportApplicationInstance(query, { sourceQuery, applicationRef, instance }),
			)
		}
	}

	const functionReports = await reportComposedFunctions(query, { sourceQuery, applicationRef })

	return mergeReports([...reports, ...functionReports] as [DiffReport, ...DiffReport[]])
}

/** Diff one Application instance and fold its (layer + cross-cutting) satellites. */
async function reportApplicationInstance(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		instance: AnyTrackedRecord | undefined
	},
): Promise<DiffReport> {
	const { sourceQuery, applicationRef, instance } = params

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
	})

	if (instance) {
		const title = await extractElementTitle(query, instance)
		for (const group of applicationReport.groups) group.instanceScopeTitle = title
	}

	return applicationReport
}

/** One report per composed Function INSTANCE (found globally by `templateUuid`). */
async function reportComposedFunctions(
	query: Core.Query<Config>,
	params: { sourceQuery: Core.Query<Config>; applicationRef: Scl.Ref<'Application'> },
): Promise<DiffReport[]> {
	const { sourceQuery, applicationRef } = params
	const functionUuids = await collectComposedFunctionUuids(sourceQuery, applicationRef)

	const reports: DiffReport[] = []
	for (const functionUuid of functionUuids) {
		const [sourceFunction] = await sourceQuery.any.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: functionUuid },
		})
		if (!sourceFunction) continue

		const functionRef = { tagName: 'Function', id: sourceFunction.id } as Scl.Ref<'Function'>
		const functionInstances = await findInstancesByTemplateUuid(query, {
			tagName: 'Function',
			sourceUuid: functionUuid,
		})
		if (functionInstances.length === 0) {
			reports.push(await reportFunction(query, { sourceQuery, functionRef, instance: undefined }))
			continue
		}
		for (const functionInstance of functionInstances) {
			const functionReport = await reportFunction(query, {
				sourceQuery,
				functionRef,
				instance: functionInstance,
			})
			const title = await extractElementTitle(query, functionInstance)
			for (const group of functionReport.groups) group.instanceScopeTitle = title
			reports.push(functionReport)
		}
	}
	return reports
}
