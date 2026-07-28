import { reportFunction } from './report-function'
import { buildReportInstance } from './report-instance'

import { assembleReport } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { findInstancesUnder } from '@/v2019C1/extensions/lifecycle/instance'

import type { Scl, Config } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport, ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
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
 * as a companion of the function's decision group (ENGINE.md §16).
 */
export async function reportFsd(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		targetParent: Scl.Ref<Scl.ElementsOf>
		scenario?: LifecycleScenario
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, targetParent, scenario } = params
	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	// `instantiate` always places a NEW instance, so it never matches an existing one.
	const instances =
		scenario === 'instantiate'
			? []
			: await findInstancesUnder(query, { targetParent, tagName: 'Function', sourceUuid })

	// no instance yet -> first-time = fast track
	if (instances.length === 0) {
		const instanceDiff = await reportFunction(query, {
			sourceQuery,
			functionRef,
			instance: undefined,
			refsAlwaysAdded: scenario === 'instantiate',
		})
		return assembleReport([
			await buildReportInstance(query, {
				instanceDiff,
				instance: undefined,
				sourceQuery,
				sourceRef: functionRef,
			}),
		])
	}

	const reportInstances: ReportInstance[] = []
	for (const instance of instances) {
		const instanceDiff = await reportFunction(query, {
			sourceQuery,
			functionRef,
			instance,
			refsAlwaysAdded: scenario === 'instantiate',
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
	return assembleReport(reportInstances)
}
