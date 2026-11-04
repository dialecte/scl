import { foldCrossCuttingSatellites } from './cross-cutting-satellites'
import { foldCarriedSatellites } from './report-function-satellites'

import { toRef } from '@dialecte/core/helpers'

import { resolveContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { foreignScopeResolver } from '@/v2019C1/extensions/lifecycle/instance'

import type { PlacementListing } from './placement-listing.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type { DecisionMappings, ReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Function-layer report core: diff the function subtree,
 * then fold its satellites as companions of the function's decision group — both
 * the layer-owned `FunctionCategory` AND the CROSS-CUTTING satellites (e.g. a
 * `Variable`) that apply to any element in the subtree.
 *
 * The `instance` is resolved by the caller — SCOPED (`findInstanceUnder`, the
 * anchored `reportFsd`) or by what an application instance stands on (the ASD
 * composed-function cascade, `resolveComposedFunctions`). Funnelling both entry points
 * through here is what makes satellites travel on every function-layer report.
 */
export async function reportFunction(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: FsdFunctionRef
		instance: AnyRefOrRecord | undefined
		/** How the instance matches source. `templateUuid` (default) or `uuid` (fork). */
		matchKey?: MatchKey
		/** The consumer's choices for the shared elements the function is classified by. */
		decisionMappings?: DecisionMappings
		/** The project element the function is placed under. */
		anchor?: Scl.Ref<Scl.ElementsOf>
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
		/** The first placement the function is part of: see `PlacementListing`. */
		placementListing?: PlacementListing
	},
): Promise<InstanceDiff> {
	const { sourceQuery, functionRef, instance } = params

	const report = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: functionRef,
		instanceRootRef: instance,
		matchKey: params.matchKey,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		// on a first placement, what the function carries is scoped as its clone is
		notSelected: readNotSelected({
			leftOut: params.selection?.leftOut,
			carried: params.placementListing?.carried.leaveOut,
		}),
	})
	// On FIRST-TIME (no instance) the satellites are still created via the clone path,
	// so they must be folded as `added` companions too — otherwise the merge-review
	// hides them when context is off. The folds no-op their instance side when
	// `instance`/`instancePrimaryRef` is undefined.
	// an element the instances share (a category) holds one reference per instance: this one is
	// compared with its own
	const sourceUuid = await sourceQuery.getAttribute(functionRef, { name: 'uuid' })
	const resolveForeignScope = instance
		? foreignScopeResolver(query, {
				instanceRootRef: instance,
				sourceUuid,
				matchKey: params.matchKey,
			})
		: undefined
	// what the references of its satellites may name: the function and what it holds, but what the selection leaves out
	const scope = await resolveContributionScope(sourceQuery, {
		roots: [functionRef],
		leftOut: params.selection?.leftOut,
	})
	const withLayerSatellites = await foldCarriedSatellites(query, {
		scope,
		pass: params.pass,
		sourceQuery,
		functionRef,
		instance,
		report,
		decisionMappings: params.decisionMappings,
		anchor: params.anchor,
		matchKey: params.matchKey,
		resolveForeignScope,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		selection: params.selection,
	})
	await foldCrossCuttingSatellites(query, {
		scope,
		placementListing: params.placementListing,
		pass: params.pass,
		sourceQuery,
		primaryRef: functionRef,
		instancePrimaryRef: instance ? (toRef(instance) as Scl.Ref<Scl.ElementsOf>) : undefined,
		report: withLayerSatellites,
		anchor: params.anchor,
		matchKey: params.matchKey,
		resolveForeignScope,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		selection: params.selection,
	})
	return withLayerSatellites
}

/** What a function's report leaves out: what the selection leaves out, and what its scoping leaves out of its clone. */
function readNotSelected(params: {
	leftOut: ReadonlySet<string> | undefined
	carried: ReadonlySet<string> | undefined
}): ReadonlySet<string> | undefined {
	const { leftOut, carried } = params
	if (!carried) return leftOut
	return new Set([...(leftOut ?? []), ...carried])
}
