import { reportFunction } from './report-function'

import { mergeReports } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { findInstancesUnder } from '@/v2019C1/extensions/lifecycle/instance'
import { extractElementTitle } from '@/v2019C1/extensions/presentation/query'

import type { Scl, Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/seam.types'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what `update.fromFsd` would change: a {@link DiffReport}
 * with the fast/full classification. No instance yet -> first-time = fast
 * (`needsDecisions: false`); one or more existing instances with changes -> full.
 *
 * The standard permits several instances of one template under one anchor, so
 * EVERY matching instance is diffed and its groups merged into one report (each
 * group tagged with its `instanceScopeId`); the decision layer targets a subset.
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
		return reportFunction(query, { sourceQuery, functionRef, instance: undefined })
	}

	const reports: DiffReport[] = []
	for (const instance of instances) {
		const instanceReport = await reportFunction(query, { sourceQuery, functionRef, instance })
		const title = await extractElementTitle(query, instance)
		for (const group of instanceReport.groups) group.instanceScopeTitle = title
		reports.push(instanceReport)
	}
	return mergeReports(reports as [DiffReport, ...DiffReport[]])
}
