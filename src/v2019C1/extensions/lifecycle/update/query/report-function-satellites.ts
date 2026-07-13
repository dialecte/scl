import { foldSatelliteCompanions } from './satellite-companions'

import { resolveFunctionSatellites } from '@/v2019C1/extensions/lifecycle/layers/function'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Fold a function's carried `FunctionCategory` satellites into its decision group
 * as read-only companions (ENGINE.md §16, G6). The function layer resolves its own
 * satellites (reverse-ref); the generic fold attaches them.
 */
export async function foldCarriedSatellites(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		report: DiffReport
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, report } = params
	const satelliteRefs = await resolveFunctionSatellites(sourceQuery, { primaryRef: functionRef })
	return foldSatelliteCompanions(query, {
		sourceQuery,
		primaryRef: functionRef,
		satelliteRefs,
		report,
	})
}
