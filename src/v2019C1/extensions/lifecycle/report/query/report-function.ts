import { foldCrossCuttingSatellites } from './cross-cutting-satellites'
import { foldCarriedSatellites } from './report-function-satellites'

import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'

import type { Config, Scl } from '@/v2019C1/config'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
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
		/** INSTANTIATE: force satellite reference children to `added` (new per-instance refs). */
		refsAlwaysAdded?: boolean
	},
): Promise<InstanceDiff> {
	const { sourceQuery, functionRef, instance } = params
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false

	const report = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: functionRef,
		instanceRootRef: instance,
	})
	// On FIRST-TIME (no instance) the satellites are still created via the clone path,
	// so they must be folded as `added` companions too — otherwise the merge-review
	// hides them when context is off. The folds no-op their instance side when
	// `instance`/`instancePrimaryRef` is undefined.
	const withLayerSatellites = await foldCarriedSatellites(query, {
		sourceQuery,
		functionRef,
		instance,
		report,
		refsAlwaysAdded,
	})
	return foldCrossCuttingSatellites(query, {
		sourceQuery,
		primaryRef: functionRef,
		instancePrimaryRef: instance
			? ({ tagName: 'Function', id: instance.id } as Scl.Ref<Scl.ElementsOf>)
			: undefined,
		report: withLayerSatellites,
		refsAlwaysAdded,
	})
}
