import { reconcileSatellites } from './satellite-reconcile'

import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { resolveFunctionSatellites } from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	findWithdrawnContributions,
	resolveSatelliteMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'

import type { Config, Scl } from '@/v2019C1/config'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction/write-identity.types'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Reconcile the satellites carried by a function (its `FunctionCategory` classification) for one
 * instance of it, gated by `accepted`. They live OUTSIDE the function subtree, so the function
 * reconcile never reaches them.
 *
 * The function layer finds its satellites on both sides — in the source, and those the instance is
 * classified by — and resolves where each source one lands (`resolveSatelliteMappings`, the answer
 * the report read too). The generic satellite reconcile then does the rest: reconcile in place
 * (only the contributed children when the category is the project's own), add a category the
 * updated template newly classifies the function by, delete one the template retired (guarded by
 * a last-referrer check, so a category still classifying another function is kept).
 *
 * What the instance gave to a project category the template no longer classifies it by is removed
 * with the removal the report announced.
 */
export async function reconcileCarriedSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: FsdFunctionRef
		instanceRef: AnyRefOrRecord
		targetParent: Scl.Ref<Scl.ElementsOf>
		accepted?: AcceptedIds
		/** `templateUuid` (default) or `uuid` (fork) match for the satellite instance. */
		matchKey?: MatchKey
		/** `stamp-template` (default) or `keep` (fork) identity for an added satellite. */
		identityMode?: IdentityMode
		/** The consumer's choices for the shared elements the function is classified by. */
		decisionMappings?: DecisionMappings
	},
): Promise<Scl.CloneMapping[]> {
	const {
		sourceQuery,
		functionRef,
		instanceRef,
		targetParent,
		accepted,
		matchKey = 'templateUuid',
		identityMode = 'stamp-template',
		decisionMappings,
	} = params

	// the instance may have been placed as a SubFunction: keep the tag it carries
	const instancePrimaryRef = {
		tagName: instanceRef.tagName,
		id: instanceRef.id,
	} as Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>

	const satelliteRefs = await resolveFunctionSatellites(sourceQuery, { primaryRef: functionRef })
	const instanceSatelliteRefs = await resolveFunctionSatellites(tx, {
		primaryRef: instancePrimaryRef,
	})

	const resolvedMappings = await resolveSatelliteMappings(tx, {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		decisionMappings,
		matchKey,
	})
	const withdrawnContributions = await findWithdrawnContributions(tx, {
		instancePrimaryRef,
		instanceSatelliteRefs,
		resolvedMappings,
		matchKey,
	})

	const structure = await resolveTargetStructure(tx, targetParent)
	const added = await reconcileSatellites(tx, {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		structure,
		accepted,
		matchKey,
		identityMode,
		resolvedMappings,
		decisionMappings,
	})

	for (const contribution of withdrawnContributions) {
		// gated on the removal the report announced for it
		if (accepted && !accepted.instanceIds.has(contribution.id)) continue
		const live = await tx.any.getRecord(contribution)
		if (live) await tx.any.delete(contribution)
	}

	return added
}
