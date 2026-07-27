import { foldSatelliteCompanions } from './satellite-companions'

import { resolveFunctionSatellites } from '@/v2019C1/extensions/lifecycle/layers/function'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Fold a function's carried `FunctionCategory` satellites into its decision group
 * as read-only companions (ENGINE.md §16, G6). The function layer resolves its own
 * satellites (reverse-ref) from the SOURCE; the generic fold attaches them.
 *
 * When an `instance` exists, the SAME reverse-ref finder is run against it so a
 * `FunctionCategory` the template RETIRED (no longer in the source) is folded as a
 * `removed` companion — accepting the function group then deletes it (matching the
 * application-layer satellite behaviour).
 */
export async function foldCarriedSatellites(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		instance: AnyRefOrRecord | undefined
		report: DiffReport
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, instance, report } = params
	const satelliteRefs = await resolveFunctionSatellites(sourceQuery, { primaryRef: functionRef })
	const instanceSatelliteRefs = instance
		? await resolveFunctionSatellites(query, {
				primaryRef: { tagName: 'Function', id: instance.id } as Scl.Ref<'Function'>,
			})
		: []
	return foldSatelliteCompanions(query, {
		sourceQuery,
		primaryRef: functionRef,
		satelliteRefs,
		instanceSatelliteRefs,
		report,
		instanceScopeId: instance?.id,
	})
}
