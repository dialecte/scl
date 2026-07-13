import { findInstanceByTemplateUuid } from '../find-instance'

import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'

import type { Config, Scl } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide'
import type * as Core from '@dialecte/core'

/**
 * Reconcile each satellite ONTO its existing instance (matched globally by
 * `templateUuid`), gated by `accepted`. Generic over the layer: the caller
 * resolves the satellite refs. Reconcile-in-place only — a satellite with no
 * instance is left to the clone/instantiate path; graft is layer-specific.
 *
 * Gating is inherited from `reconcile`: it only writes records whose source id is
 * in `accepted`, so a satellite travels iff its primary's group is accepted (its
 * report companion contributed that id).
 */
export async function reconcileSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		satelliteRefs: Scl.Ref<Scl.ElementsOf>[]
		accepted?: AcceptedIds
	},
): Promise<void> {
	const { sourceQuery, satelliteRefs, accepted } = params

	for (const satelliteRef of satelliteRefs) {
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
