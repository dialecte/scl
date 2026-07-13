import { collectComposedFunctionUuids } from '../composed-functions'
import { findInstanceByTemplateUuid } from '../find-instance'
import { reportFunction } from './report-function'

import { diff, mergeReports } from '@/v2019C1/extensions/lifecycle/engine/diff'

import type { Scl, Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what `update.fromAsd` would change: the **application
 * layer** (the `Application` subtree) PLUS the **function-layer cascade** (each
 * composed Function the ASD references, mirroring the apply cascade). The
 * per-layer reports are merged into one — `groups` covers both layers, so the
 * full-track surface is complete. Fast/full classification as in {@link reportFsd}.
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
	const applicationInstance = await findInstanceByTemplateUuid(query, {
		tagName: 'Application',
		sourceUuid,
	})
	const applicationReport = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: applicationRef,
		instanceRootRef: applicationInstance,
	})

	const functionReports = await reportComposedFunctions(query, { sourceQuery, applicationRef })

	return mergeReports([applicationReport, ...functionReports])
}

/** One report per composed Function (found globally by `templateUuid`). */
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
		const functionInstance = await findInstanceByTemplateUuid(query, {
			tagName: 'Function',
			sourceUuid: functionUuid,
		})
		reports.push(
			await reportFunction(query, {
				sourceQuery,
				functionRef,
				instance: functionInstance,
			}),
		)
	}
	return reports
}
