import { findInstanceByTemplateUuid } from '../find-instance'

import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { resolveCarriedSatellites } from '@/v2019C1/extensions/lifecycle/engine/satellites'

import type { Config, Scl } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide'
import type * as Core from '@dialecte/core'

/**
 * Reconcile each carried satellite (e.g. a `FunctionCategory`) of a function ONTO
 * its existing instance, gated by `accepted` (ENGINE.md §16). The satellite lives
 * OUTSIDE the function subtree, so the function reconcile never reaches it; here
 * it is matched globally by `templateUuid` and reconciled in place. The write is
 * gated exactly like the function's: `reconcile` only touches records whose source
 * id is in `accepted`, so the satellite travels iff its function group is accepted
 * (its report companion contributed that id).
 *
 * v1: update-in-place only. A satellite with no existing instance is left to the
 * clone path; graft and deletion are deferred (shared-satellite safety).
 */
export async function reconcileCarriedSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		accepted?: AcceptedIds
	},
): Promise<void> {
	const { sourceQuery, functionRef, accepted } = params

	const satellites = await resolveCarriedSatellites(sourceQuery, { primaryRef: functionRef })
	for (const satelliteRef of satellites) {
		const { uuid: sourceUuid } = await sourceQuery.any.getAttributes(satelliteRef)
		const instance = await findInstanceByTemplateUuid(tx, {
			tagName: satelliteRef.tagName,
			sourceUuid,
		})
		if (!instance) continue

		await reconcile(tx, {
			sourceQuery,
			sourceRootRef: satelliteRef,
			instanceRootRef: instance,
			accepted,
		})
	}
}
