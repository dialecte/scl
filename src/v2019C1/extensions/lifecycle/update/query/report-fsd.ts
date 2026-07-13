import { findInstanceUnder } from '../find-instance'
import { foldCarriedSatellites } from './report-function-satellites'

import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'

import type { Scl, Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what `update.fromFsd` would change: a {@link DiffReport}
 * with the fast/full classification. No instance yet -> first-time = fast
 * (`needsDecisions: false`); an existing instance with changes -> full.
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
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, targetParent } = params
	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	const instance = await findInstanceUnder(query, { targetParent, tagName: 'Function', sourceUuid })
	const report = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: functionRef,
		instanceRootRef: instance,
	})
	// first-time (no instance): satellites are created via the clone path; nothing to fold
	if (!instance) return report
	return foldCarriedSatellites(query, { sourceQuery, functionRef, report })
}
