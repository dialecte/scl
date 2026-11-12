import { foldSatelliteCompanions } from './satellite-companions'

import {
	findHeldSatelliteIds,
	resolveAppliedSatellites,
	resolveAppliedSatelliteTargets,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { collectDuplicateApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications'

import type { SatelliteFoldTarget } from './cross-cutting-satellites.types'
import type { PlacementListing } from './placement-listing.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { SatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
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
 * Within one first placement (`placementListing`), a satellite is listed with the first primary it applies to — one
 * a primary holds, with that primary's own content —, its references naming what the placement places: as the apply
 * places it, once.
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
		/** What the consumer's resolution tells the diff, read once: see `DiffPolicy`. */
		diffPolicy: DiffPolicy
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
		/**
		 * The source elements the placement leaves out (record ids). Default: the first placement's, else what the selection
		 * leaves out of the template.
		 */
		leftOut?: ReadonlySet<string>
		/**
		 * On a first placement, what the primary refers to (what the roles of an application name): listed with it,
		 * whatever it applies to.
		 */
		referencedRefs?: readonly Scl.Ref<Scl.ElementsOf>[]
		/** The references below what the primary refers to that its placement leaves out (record ids). */
		referencedLeaveOut?: ReadonlySet<string>
		/** The satellites of the template, read once by the report: see `readSatelliteIndex`. Default: the listing's. */
		index?: SatelliteIndex
	},
): Promise<void> {
	const { sourceQuery, primaryRef, instancePrimaryRef, report, placementListing } = params

	const resolvedTargets = await resolveAppliedSatelliteTargets(sourceQuery, {
		primaryRef,
		leftOut: params.leftOut ?? placementListing?.leftOut ?? params.selection?.within,
		frame: params.frame,
		scope: placementListing?.scope ?? params.scope,
		index: params.index ?? placementListing?.index,
	})
	// on a first placement, one the project holds by its uuid already is not placed again, nor listed; nor one left
	// applying to nothing, the project's copy making each of its applications already
	const held = placementListing
		? await findHeldSatelliteIds(query, { satellites: resolvedTargets })
		: new Set<string>()
	// what applies where the project's copy of it applies already does not apply there twice, as the apply places it
	const duplicates = placementListing
		? collectDuplicateApplications({
				satellites: resolvedTargets,
				index: placementListing.index,
				held: placementListing.held,
			})
		: undefined
	const applied = resolvedTargets
		.filter(function isPlaced(satellite) {
			const satelliteId = satellite.satelliteRef.id ?? ''
			return !held.has(satelliteId) && !placementListing?.carried.notPlaced.has(satelliteId)
		})
		.map(function satelliteOf(satellite) {
			return satellite.satelliteRef
		})
	// what the primary refers to first — but what applies to a primary the placement places, listed with the first it
	// applies to, and what its frame places —, then what applies to it: the placement's listing claims each once
	const referenced = (params.referencedRefs ?? []).filter(function isTheReferrers(satelliteRef) {
		const satelliteId = satelliteRef.id ?? ''
		return (
			!placementListing?.appliedToPrimaries.has(satelliteId) &&
			!placementListing?.framed.has(satelliteId)
		)
	})
	const resolved = [...referenced, ...applied]
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
		// what applies to a primary is no shared element: nothing of it is found by name
		landings: [],
		satelliteRefs,
		instanceSatelliteRefs,
		report,
		instanceScopeId: instancePrimaryRef?.id,
		anchor: params.anchor,
		matchKey: params.matchKey,
		instancePrimaryRef,
		resolveForeignScope: params.resolveForeignScope,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		// what the selection leaves out, the references what the primary refers to is placed without, and those the
		// placement's scoping leaves out
		notSelected: readNotSelected({
			selection: params.selection?.leftOut,
			referenced: params.referencedLeaveOut,
			carried: placementListing?.carried.leaveOut,
			duplicates,
		}),
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

/**
 * What the fold leaves out of the satellites' content: the selection's, the role's, the placement's scoping, the
 * applications the project's copies make already.
 */
function readNotSelected(params: {
	selection: ReadonlySet<string> | undefined
	referenced: ReadonlySet<string> | undefined
	carried: ReadonlySet<string> | undefined
	duplicates: ReadonlySet<string> | undefined
}): ReadonlySet<string> | undefined {
	const { selection, referenced, carried, duplicates } = params
	if (!referenced?.size && !carried?.size && !duplicates?.size) return selection
	return new Set([
		...(selection ?? []),
		...(referenced ?? []),
		...(carried ?? []),
		...(duplicates ?? []),
	])
}
