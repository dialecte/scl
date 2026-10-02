import { foldSatelliteCompanions } from './satellite-companions'

import { resolveFunctionSatellites } from '@/v2019C1/extensions/lifecycle/layers/function'

import type { Config, Scl } from '@/v2019C1/config'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
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
		/** INSTANTIATE: force satellite reference children to `added` (new per-instance refs). */
		refsAlwaysAdded?: boolean
		/** The consumer's choices for the shared elements the function is classified by. */
		decisionMappings?: DecisionMappings
		/** The project element the function is placed under. */
		anchor?: Scl.Ref<Scl.ElementsOf>
		/** How an instance element carries its source element's uuid. Default `templateUuid`. */
		matchKey?: MatchKey
		/** What belongs to the other instances of the function. */
		resolveForeignScope?: ResolveForeignScope
	},
): Promise<InstanceDiff> {
	const { sourceQuery, functionRef, instance, report } = params
	const satelliteRefs = await resolveFunctionSatellites(sourceQuery, { primaryRef: functionRef })
	const instanceSatelliteRefs = instance
		? await resolveFunctionSatellites(query, {
				primaryRef: { tagName: 'Function', id: instance.id } as Scl.Ref<'Function'>,
			})
		: []
	return foldSatelliteCompanions(query, {
		sourceQuery,
		primaryRef: functionRef,
		satelliteRefs,
		instanceSatelliteRefs,
		report,
		instanceScopeId: instance?.id,
		refsAlwaysAdded: params.refsAlwaysAdded ?? false,
		decisionMappings: params.decisionMappings,
		anchor: params.anchor,
		matchKey: params.matchKey,
		instancePrimaryRef: instance
			? ({ tagName: instance.tagName, id: instance.id } as Scl.Ref<Scl.ElementsOf>)
			: undefined,
		resolveForeignScope: params.resolveForeignScope,
	})
}
