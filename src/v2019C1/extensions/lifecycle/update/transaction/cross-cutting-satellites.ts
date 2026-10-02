import { reconcileSatellites } from './satellite-reconcile'

import { resolveAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import {
	findWithdrawnContributions,
	resolveSatelliteMappings,
	toRedirectMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'

import type { ReconcileCrossCuttingSatellitesResult } from './cross-cutting-satellites.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction/write-identity.types'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Carry the CROSS-CUTTING satellites (Variable / BehaviorDescription) that apply
 * to ANY element in the primary subtree, gated by
 * `accepted`. The single apply-side entry point every layer calls with its own
 * `primaryRef` (function, application, and future IED / topology) so the 3-way
 * add / reconcile-in-place / delete is uniform and impossible to forget.
 *
 * These are SHARED elements: where each source one lands for this instance is resolved first
 * (`resolveSatelliteMappings`, the answer the report read too) — the one the instance already
 * holds, by lineage or because it was mapped onto an element of the project, else the element its
 * mapping resolves to. What the instance gave to a project element the template no longer brings
 * anything for is removed with the removal the report announced.
 *
 * `instancePrimaryRef` is the target-side primary; pass it when an instance exists. Layer-owned
 * satellites (FunctionCategory, AllocationRole) are reconciled separately by their own layer finder.
 */
export async function reconcileCrossCuttingSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<Scl.ElementsOf>
		instancePrimaryRef?: Scl.Ref<Scl.ElementsOf>
		structure: TargetStructure
		accepted?: AcceptedIds
		matchKey?: MatchKey
		identityMode?: IdentityMode
		/** What belongs to the other instances of the primary's template. */
		resolveForeignScope?: ResolveForeignScope
	},
): Promise<ReconcileCrossCuttingSatellitesResult> {
	const {
		sourceQuery,
		primaryRef,
		instancePrimaryRef,
		structure,
		accepted,
		matchKey,
		identityMode,
	} = params

	const satelliteRefs = await resolveAppliedSatellites(sourceQuery, { primaryRef })
	const instanceSatelliteRefs = instancePrimaryRef
		? await resolveAppliedSatellites(tx, { primaryRef: instancePrimaryRef })
		: []

	const resolvedMappings = await resolveSatelliteMappings(tx, {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		matchKey,
	})
	const redirectMappings = await toRedirectMappings({
		sourceQuery,
		satelliteRefs,
		resolvedMappings,
	})
	const withdrawnContributions = instancePrimaryRef
		? await findWithdrawnContributions(tx, {
				instancePrimaryRef,
				instanceSatelliteRefs,
				resolvedMappings,
				matchKey,
			})
		: []

	const cloneMappings = await reconcileSatellites(tx, {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		structure,
		accepted,
		matchKey,
		identityMode,
		resolvedMappings,
		resolveForeignScope: params.resolveForeignScope,
	})

	for (const contribution of withdrawnContributions) {
		// gated on the removal the report announced for it
		if (accepted && !accepted.instanceIds.has(contribution.id)) continue
		const live = await tx.any.getRecord(contribution)
		if (live) await tx.any.delete(contribution)
	}

	return { cloneMappings, redirectMappings }
}
