import { reconcileSatellites } from './satellite-reconcile'

import { resolveAppliedSatellites } from '@/v2019C1/extensions/lifecycle/satellites/applied-satellites'

import type { Config, Scl } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Carry the CROSS-CUTTING satellites (Variable / BehaviorDescription — 90-30
 * §12.1/§13.1) that apply to ANY element in the primary subtree, gated by
 * `accepted`. The single apply-side entry point every layer calls with its own
 * `primaryRef` (function, application, and future IED / topology) so the 3-way
 * graft / reconcile-in-place / delete is uniform and impossible to forget.
 *
 * `instancePrimaryRef` is the target-side primary (for removal detection); pass it
 * when an instance exists. Layer-owned satellites (FunctionCategory, AllocationRole)
 * are reconciled separately by their own layer finder.
 */
export async function reconcileCrossCuttingSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<Scl.ElementsOf>
		instancePrimaryRef?: Scl.Ref<Scl.ElementsOf>
		structure: TargetStructure
		accepted?: AcceptedIds
	},
): Promise<void> {
	const { sourceQuery, primaryRef, instancePrimaryRef, structure, accepted } = params

	const satelliteRefs = await resolveAppliedSatellites(sourceQuery, { primaryRef })
	const instanceSatelliteRefs = instancePrimaryRef
		? await resolveAppliedSatellites(tx, { primaryRef: instancePrimaryRef })
		: []

	await reconcileSatellites(tx, {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		structure,
		accepted,
	})
}
