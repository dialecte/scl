import { reconcileSatellites } from './satellite-reconcile'

import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { resolveFunctionSatellites } from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	assertMappingsDecided,
	findWithdrawnContributions,
	resolveSatelliteMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'

import type { Config, Scl } from '@/v2019C1/config'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
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
		/** The scenario's key an instance of a satellite carries its source satellite's uuid in. */
		matchKey: MatchKey
		/** The scenario's identity for an added satellite. */
		identityMode: ScenarioPolicy['identityMode']
		/** A shared element created here whose name its level holds is numbered. */
		bumpsCollisions: boolean
		/** What tells a satellite the source dropped from one the project added: see `classifyUnmatched`. */
		removalBase: RemovalBase
		/** Whose names an update follows: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/** The consumer's choices for the shared elements the function is classified by. */
		decisionMappings?: DecisionMappings
		/** What belongs to the other instances of the function. */
		resolveForeignScope?: ResolveForeignScope
		/** What the selection of functional variants of the instances this is for leaves out of the template. */
		selection?: VariantSelection
	},
): Promise<Scl.CloneMapping[]> {
	const {
		sourceQuery,
		functionRef,
		instanceRef,
		targetParent,
		accepted,
		matchKey,
		identityMode,
		bumpsCollisions,
		decisionMappings,
	} = params

	// the instance may have been placed as a SubFunction: keep the tag it carries
	const instancePrimaryRef = {
		tagName: instanceRef.tagName,
		id: instanceRef.id,
	} as Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>

	const satelliteRefs = await resolveFunctionSatellites(sourceQuery, {
		primaryRef: functionRef,
		leftOut: params.selection?.within,
	})
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
	// a category nothing is decided for: nothing is written until the consumer chose
	assertMappingsDecided({ satelliteRefs, resolvedMappings })
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
		bumpsCollisions,
		removalBase: params.removalBase,
		namesFollow: params.namesFollow,
		resolvedMappings,
		decisionMappings,
		resolveForeignScope: params.resolveForeignScope,
		notSelected: params.selection?.leftOut,
	})

	for (const contribution of withdrawnContributions) {
		// gated on the removal the report announced for it
		if (accepted && !accepted.instanceIds.has(contribution.id)) continue
		const live = await tx.any.getRecord(contribution)
		if (live) await tx.any.delete(contribution)
	}

	return added
}
