import { reconcileSatellites } from './satellite-reconcile'

import { resolveContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { resolveFunctionSatellites } from '@/v2019C1/extensions/lifecycle/layers/function'
import { readLinkedSections } from '@/v2019C1/extensions/lifecycle/linked-sections/read'
import { assertMappingsDecided } from '@/v2019C1/extensions/lifecycle/mapping'

import type { Config, Scl } from '@/v2019C1/config'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type { LinkedSectionReading } from '@/v2019C1/extensions/lifecycle/linked-sections/description.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Read the satellites carried by a function (its `FunctionCategory` classification) for one instance of it, before
 * the update writes anything — what the report read: the source ones, where each lands (`resolveSatelliteMappings`)
 * and what goes of those the template retired (`resolveSatelliteRemovals`). A category nothing is decided for is
 * refused here: nothing is written until the consumer chose.
 */
export async function readCarriedSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: FsdFunctionRef
		instanceRef: AnyRefOrRecord
		/** The scenario's key an instance of a satellite carries its source satellite's uuid in. */
		matchKey: MatchKey
		/** What tells a satellite the source dropped from one the project added: see `classifyUnmatched`. */
		removalBase: RemovalBase
		/** The consumer's choices for the shared elements the function is classified by. */
		decisionMappings?: DecisionMappings
		/** What the selection of functional variants of the instances this is for leaves out of the template. */
		selection?: VariantSelection
	},
): Promise<LinkedSectionReading> {
	const { sourceQuery, functionRef, instanceRef, matchKey } = params

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

	// what their references may name: the function and what it holds, but what the selection leaves out
	const scope = await resolveContributionScope(sourceQuery, {
		roots: [functionRef],
		leftOut: params.selection?.leftOut,
	})
	const reading = await readLinkedSections(tx, {
		sourceQuery,
		description: { satelliteRefs, instanceSatelliteRefs, scope },
		instancePrimaryRef,
		decisionMappings: params.decisionMappings,
		removalBase: params.removalBase,
		matchKey,
	})
	// a category nothing is decided for: nothing is written until the consumer chose
	assertMappingsDecided({ satelliteRefs, resolvedMappings: reading.resolvedMappings })
	return reading
}

/**
 * Reconcile the satellites carried by a function (its `FunctionCategory` classification) for one
 * instance of it, gated by `accepted`, as {@link readCarriedSatellites} read them. They live OUTSIDE
 * the function subtree, so the function reconcile never reaches them.
 *
 * The generic satellite reconcile does the rest: reconcile in place (only the contributed children
 * when the category is the project's own), add a category the updated template newly classifies the
 * function by, delete one the template retired — or, while it still classifies a function outside
 * the instance, only the instance's reference in it. What the instance gave to a project category the
 * template no longer classifies it by is removed with the removal the report announced.
 */
export async function reconcileCarriedSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		/** What the update read of the instance's satellites before writing. */
		reading: LinkedSectionReading
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
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
		/** The consumer's choices for the shared elements the function is classified by. */
		decisionMappings?: DecisionMappings
		/** What belongs to the other instances of the function. */
		resolveForeignScope?: ResolveForeignScope
		/** What the selection of functional variants of the instances this is for leaves out of the template. */
		selection?: VariantSelection
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, reading, targetParent } = params

	const structure = await resolveTargetStructure(tx, targetParent)
	return reconcileSatellites(tx, {
		sourceQuery,
		satelliteRefs: reading.satelliteRefs,
		removals: reading.removals,
		structure,
		accepted: params.accepted,
		matchKey: params.matchKey,
		identityMode: params.identityMode,
		bumpsCollisions: params.bumpsCollisions,
		removalBase: params.removalBase,
		namesFollow: params.namesFollow,
		placeholderLineages: params.placeholderLineages,
		resolvedMappings: reading.resolvedMappings,
		decisionMappings: params.decisionMappings,
		resolveForeignScope: params.resolveForeignScope,
		notSelected: params.selection?.leftOut,
		scope: reading.scope,
	})
}
