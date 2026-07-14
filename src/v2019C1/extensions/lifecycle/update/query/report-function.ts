import { foldCrossCuttingSatellites } from './cross-cutting-satellites'
import { foldCarriedSatellites } from './report-function-satellites'

import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Function-layer report core (ENGINE.md §16, D-SAT-6): diff the function subtree,
 * then fold its satellites as companions of the function's decision group — both
 * the layer-owned `FunctionCategory` AND the CROSS-CUTTING satellites (e.g. a
 * `Variable`) that apply to any element in the subtree.
 *
 * The `instance` is resolved by the caller — SCOPED (`findInstanceUnder`, the
 * anchored `reportFsd`) or GLOBAL (`findInstanceByTemplateUuid`, the ASD
 * composed-function cascade which has no anchor). Funnelling both entry points
 * through here is what makes satellites travel on every function-layer report.
 */
export async function reportFunction(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		instance: AnyRefOrRecord | undefined
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, instance } = params

	const report = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: functionRef,
		instanceRootRef: instance,
	})
	// first-time (no instance): satellites are created via the clone path; nothing to fold
	if (!instance) return report

	const withLayerSatellites = await foldCarriedSatellites(query, {
		sourceQuery,
		functionRef,
		instance,
		report,
	})
	return foldCrossCuttingSatellites(query, {
		sourceQuery,
		primaryRef: functionRef,
		instancePrimaryRef: { tagName: 'Function', id: instance.id } as Scl.Ref<Scl.ElementsOf>,
		report: withLayerSatellites,
	})
}
