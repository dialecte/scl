import { foldSatelliteCompanions } from './satellite-companions'

import { toRef } from '@dialecte/core/helpers'

import { resolveFunctionSatellites } from '@/v2019C1/extensions/lifecycle/layers/function'

import type { Config, Scl } from '@/v2019C1/config'
import type { BoundLogicalNodeTypes } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type { DecisionMappings, ReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Fold a function's carried `FunctionCategory` satellites into its decision group
 * as read-only companions. The function layer resolves its own
 * satellites (reverse-ref) from the SOURCE; the generic fold attaches them.
 *
 * When an `instance` exists, the SAME reverse-ref finder is run against it so a
 * `FunctionCategory` the template RETIRED (no longer in the source) is folded as a
 * `removed` companion — accepting the function group then deletes it (matching the
 * application-layer satellite behaviour).
 */
export async function foldCarriedSatellites(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: FsdFunctionRef
		instance: AnyRefOrRecord | undefined
		report: InstanceDiff
		/** The consumer's choices for the shared elements the function is classified by. */
		decisionMappings?: DecisionMappings
		/** The project element the function is placed under. */
		anchor?: Scl.Ref<Scl.ElementsOf>
		/** How an instance element carries its source element's uuid. Default `templateUuid`. */
		matchKey?: MatchKey
		/** What belongs to the other instances of the function. */
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
		/** What the categories' references may name: the function and what it holds. */
		scope: ContributionScope
	},
): Promise<InstanceDiff> {
	const { sourceQuery, functionRef, instance, report } = params
	const satelliteRefs = await resolveFunctionSatellites(sourceQuery, {
		primaryRef: functionRef,
		leftOut: params.selection?.within,
	})
	const instanceSatelliteRefs = instance
		? await resolveFunctionSatellites(query, {
				primaryRef: toRef(instance) as Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>,
			})
		: []
	return foldSatelliteCompanions(query, {
		pass: params.pass,
		sourceQuery,
		primaryRef: functionRef,
		satelliteRefs,
		instanceSatelliteRefs,
		report,
		instanceScopeId: instance?.id,
		decisionMappings: params.decisionMappings,
		anchor: params.anchor,
		matchKey: params.matchKey,
		instancePrimaryRef: instance
			? ({ tagName: instance.tagName, id: instance.id } as Scl.Ref<Scl.ElementsOf>)
			: undefined,
		resolveForeignScope: params.resolveForeignScope,
		removalBase: params.removalBase,
		boundLogicalNodeTypes: params.boundLogicalNodeTypes,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		notSelected: params.selection?.leftOut,
		scope: params.scope,
	})
}
