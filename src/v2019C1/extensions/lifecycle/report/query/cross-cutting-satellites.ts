import { foldSatelliteCompanions } from './satellite-companions'

import { resolveAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'

import type { Config, Scl } from '@/v2019C1/config'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Fold the CROSS-CUTTING satellites (Variable / BehaviorDescription) that apply
 * to ANY element in the primary subtree as companions of
 * the primary's decision group. This is the single report-side entry point every
 * layer calls with its own `primaryRef` (function, application, and future IED /
 * topology), so cross-cutting carry is uniform and impossible to forget.
 *
 * `instancePrimaryRef` is the target-side primary (for removal detection); pass it
 * when an instance exists. Layer-owned satellites (FunctionCategory, AllocationRole)
 * are folded separately by their own layer finder.
 */
export async function foldCrossCuttingSatellites(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<Scl.ElementsOf>
		instancePrimaryRef?: Scl.Ref<Scl.ElementsOf>
		report: InstanceDiff
	},
): Promise<InstanceDiff> {
	const { sourceQuery, primaryRef, instancePrimaryRef, report } = params

	const satelliteRefs = await resolveAppliedSatellites(sourceQuery, { primaryRef })
	const instanceSatelliteRefs = instancePrimaryRef
		? await resolveAppliedSatellites(query, { primaryRef: instancePrimaryRef })
		: []

	return foldSatelliteCompanions(query, {
		sourceQuery,
		primaryRef,
		satelliteRefs,
		instanceSatelliteRefs,
		report,
		instanceScopeId: instancePrimaryRef?.id,
	})
}
