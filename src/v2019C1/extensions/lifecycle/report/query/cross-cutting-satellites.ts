import { foldSatelliteCompanions } from './satellite-companions'

import { resolveAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'

import type { SatelliteFoldTarget } from './cross-cutting-satellites.types'
import type { PlacementListing } from './placement-listing.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { BoundLogicalNodeTypes } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type { ReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
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
 *
 * Within one first placement (`placementListing`), a satellite is listed with the first primary it applies to, its
 * references naming what the placement places: as the apply places it, once.
 */
export async function foldCrossCuttingSatellites(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<Scl.ElementsOf>
		instancePrimaryRef?: Scl.Ref<Scl.ElementsOf>
		report: SatelliteFoldTarget
		/** The project element the primary is placed under. */
		anchor?: Scl.Ref<Scl.ElementsOf>
		/** How an instance element carries its source element's uuid. Default `templateUuid`. */
		matchKey?: MatchKey
		/** What belongs to the other instances of the primary's template. */
		resolveForeignScope?: ResolveForeignScope
		/** What the whole report already listed and named. */
		pass?: ReportPass
		/** What tells an element the source dropped from one the project added: see `classifyUnmatched`. */
		removalBase: RemovalBase
		/** Whether a bound logical node takes the type the template gives it: see `Resolution.boundLogicalNodeTypes`. */
		boundLogicalNodeTypes?: BoundLogicalNodeTypes
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
		/** Whose names an update follows: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/** What the selection of functional variants of the instances this is for leaves out of the template. */
		selection?: VariantSelection
		/** What the satellites' references may name: what the placement places or the instance holds. */
		scope: ContributionScope
		/** The first placement the primary is part of: see {@link PlacementListing}. */
		placementListing?: PlacementListing
		/** The primary is a topology frame: what its levels hold is folded too (see `resolveAppliedSatellites`). */
		frame?: boolean
		/** The source elements the placement leaves out (record ids). Default: what the selection leaves out of the template. */
		leftOut?: ReadonlySet<string>
	},
): Promise<void> {
	const { sourceQuery, primaryRef, instancePrimaryRef, report, placementListing } = params

	const resolved = await resolveAppliedSatellites(sourceQuery, {
		primaryRef,
		leftOut: params.leftOut ?? params.selection?.within,
		frame: params.frame,
	})
	// one the placement listed with another primary is placed once: listed there only
	const satelliteRefs = placementListing
		? claimUnlisted({ satelliteRefs: resolved, listed: placementListing.satellites })
		: resolved
	const instanceSatelliteRefs = instancePrimaryRef
		? await resolveAppliedSatellites(query, { primaryRef: instancePrimaryRef })
		: []

	await foldSatelliteCompanions(query, {
		pass: params.pass,
		sourceQuery,
		primaryRef,
		satelliteRefs,
		instanceSatelliteRefs,
		report,
		instanceScopeId: instancePrimaryRef?.id,
		anchor: params.anchor,
		matchKey: params.matchKey,
		instancePrimaryRef,
		resolveForeignScope: params.resolveForeignScope,
		removalBase: params.removalBase,
		boundLogicalNodeTypes: params.boundLogicalNodeTypes,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		notSelected: params.selection?.leftOut,
		scope: placementListing?.scope ?? params.scope,
	})
}

/** The satellites a placement has not listed yet, each listed now: the first primary it applies to lists it. */
function claimUnlisted(params: {
	satelliteRefs: readonly Scl.Ref<Scl.ElementsOf>[]
	listed: Set<string>
}): Scl.Ref<Scl.ElementsOf>[] {
	const { satelliteRefs, listed } = params
	const claimed: Scl.Ref<Scl.ElementsOf>[] = []
	for (const satelliteRef of satelliteRefs) {
		const satelliteId = satelliteRef.id ?? ''
		if (listed.has(satelliteId)) continue
		listed.add(satelliteId)
		claimed.push(satelliteRef)
	}
	return claimed
}
