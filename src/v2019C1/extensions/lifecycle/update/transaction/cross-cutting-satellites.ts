import { reconcileSatellites } from './satellite-reconcile'

import { resolveAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import {
	resolveSatelliteMappings,
	resolveSatelliteRemovals,
	toRedirectMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'

import type { ReconcileCrossCuttingSatellitesResult } from './cross-cutting-satellites.types'
import type { SatelliteReading } from './satellite-reading.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Read the CROSS-CUTTING satellites (Variable / BehaviorDescription) that apply to any element in
 * the primary subtree, for one instance, before the update writes anything — what the report read:
 * the source ones, the one the instance holds for each (`resolveSatelliteMappings`: made from it, or
 * given the instance's references by an earlier placement), and what goes of those the template no
 * longer brings anything for (`resolveSatelliteRemovals`). The single apply-side entry point every
 * layer calls with its own `primaryRef` (function, application, and future IED / topology).
 *
 * `instancePrimaryRef` is the target-side primary; pass it when an instance exists. Layer-owned
 * satellites (FunctionCategory, AllocationRole) are read separately by their own layer finder.
 */
export async function readCrossCuttingSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<Scl.ElementsOf>
		instancePrimaryRef?: Scl.Ref<Scl.ElementsOf>
		matchKey: MatchKey
		/** What tells a satellite the source dropped from one the project added: see `classifyUnmatched`. */
		removalBase: RemovalBase
		/** What the selection of functional variants of the instances this is for leaves out of the template. */
		selection?: VariantSelection
		/** What the satellites' references may name: what the instance holds or the update brings. */
		scope: ContributionScope
	},
): Promise<SatelliteReading> {
	const { sourceQuery, primaryRef, instancePrimaryRef, matchKey } = params

	const satelliteRefs = await resolveAppliedSatellites(sourceQuery, {
		primaryRef,
		leftOut: params.selection?.within,
	})
	const instanceSatelliteRefs = instancePrimaryRef
		? await resolveAppliedSatellites(tx, { primaryRef: instancePrimaryRef })
		: []

	const resolvedMappings = await resolveSatelliteMappings(tx, {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		matchKey,
		// what applies to a primary is no shared element: nothing of it is found by name
		landings: [],
	})
	const removals = instancePrimaryRef
		? await resolveSatelliteRemovals(tx, {
				sourceQuery,
				instancePrimaryRef,
				instanceSatelliteRefs,
				resolvedMappings,
				removalBase: params.removalBase,
				matchKey,
			})
		: []
	return { satelliteRefs, resolvedMappings, removals, scope: params.scope }
}

/**
 * Carry the CROSS-CUTTING satellites {@link readCrossCuttingSatellites} read, gated by `accepted`:
 * the 3-way add / reconcile-in-place / delete, uniform for every layer. Each belongs to the
 * instance: the one it already holds is reconciled, else a new one is added; what goes of one the
 * template no longer brings anything for is removed with the removal the report announced.
 */
export async function reconcileCrossCuttingSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		/** What the update read of the instance's satellites before writing. */
		reading: SatelliteReading
		structure: TargetStructure
		accepted?: AcceptedIds
		matchKey: MatchKey
		identityMode: ScenarioPolicy['identityMode']
		bumpsCollisions: boolean
		/** What tells a satellite the source dropped from one the project added: see `classifyUnmatched`. */
		removalBase: RemovalBase
		/** Whose names an update follows: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
		/** What belongs to the other instances of the primary's template. */
		resolveForeignScope?: ResolveForeignScope
		/** What the selection of functional variants of the instances this is for leaves out of the template. */
		selection?: VariantSelection
	},
): Promise<ReconcileCrossCuttingSatellitesResult> {
	const { sourceQuery, reading } = params

	const redirectMappings = await toRedirectMappings({
		sourceQuery,
		satelliteRefs: reading.satelliteRefs,
		resolvedMappings: reading.resolvedMappings,
	})
	const cloneMappings = await reconcileSatellites(tx, {
		sourceQuery,
		satelliteRefs: reading.satelliteRefs,
		removals: reading.removals,
		structure: params.structure,
		accepted: params.accepted,
		matchKey: params.matchKey,
		identityMode: params.identityMode,
		bumpsCollisions: params.bumpsCollisions,
		removalBase: params.removalBase,
		namesFollow: params.namesFollow,
		placeholderLineages: params.placeholderLineages,
		resolvedMappings: reading.resolvedMappings,
		resolveForeignScope: params.resolveForeignScope,
		notSelected: params.selection?.leftOut,
		scope: reading.scope,
	})

	return { cloneMappings, redirectMappings }
}
