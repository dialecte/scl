import { resolveInstanceHoldings } from './resolve-instance-holdings'

import { resolveStandings } from '@/v2019C1/extensions/lifecycle/engine/standing'
import {
	findComposedFunctionRefs,
	findInstancesByTemplateUuid,
	findInstancesUnder,
} from '@/v2019C1/extensions/lifecycle/instance'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import { findHeldLevel } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { ResolveComposedFunctionsParams } from './resolve-composed-functions.types'
import type { InstanceHoldings } from './resolve-instance-holdings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	ChildStandings,
	StandingChild,
	StandingPolicy,
} from '@/v2019C1/extensions/lifecycle/engine/standing'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * What stands, for each instance of the application, for each function its template composes —
 * the engine's rule (`resolveStandings`) over what the application layer knows:
 *  - an instance owns the functions it refers to;
 *  - it lives on the levels of its other functions (else where the consumer started): that is where
 *    a function of the lineage is looked for, and where a new one is placed.
 * Each instance is read once per run.
 */
export async function resolveComposedFunctions(
	query: Core.Query<Config>,
	params: ResolveComposedFunctionsParams,
): Promise<ChildStandings[]> {
	const { sourceQuery, applicationRef, applicationInstances, anchor, matchKey } = params

	const functionRefs = await findComposedFunctionRefs(sourceQuery, applicationRef)
	if (functionRefs.length === 0) return []

	const children: StandingChild[] = []
	const heldFunctions = new Map<string, AnyTrackedRecord[]>()
	for (const functionRef of functionRefs) {
		const lineage = await sourceQuery.getAttribute(functionRef, { name: 'uuid' })
		children.push({ ref: functionRef, lineage })
		heldFunctions.set(
			functionRef.id,
			await findInstancesByTemplateUuid(query, {
				tagName: 'Function',
				sourceUuid: lineage,
				matchKey,
			}),
		)
	}

	const holdings = new Map<string, InstanceHoldings>()
	for (const instance of applicationInstances) {
		holdings.set(
			instance.id,
			await resolveInstanceHoldings(query, {
				sourceQuery,
				applicationRef,
				instance,
				functionRefs,
				heldFunctions,
			}),
		)
	}
	const anchorStructure = anchor ? await resolveTargetStructure(query, anchor) : undefined

	const policy: StandingPolicy = {
		owned: ({ instance, child }) =>
			holdings.get(instance.id)?.ownedFunctions.get(child.ref.id) ?? [],
		levelOf: async ({ instance, child }) => {
			const heldLevels = holdings.get(instance.id)?.heldLevels
			const heldLevel = heldLevels
				? await findHeldLevel(sourceQuery, { sourceRef: child.ref, heldLevels })
				: undefined
			return heldLevel ?? (await policy.anchorLevelOf?.(child))
		},
		lineageAt: ({ level, child }) =>
			findInstancesUnder(query, {
				targetParent: level,
				tagName: 'Function',
				sourceUuid: child.lineage,
				matchKey,
			}),
		anchorLevelOf: async (child) =>
			anchorStructure
				? ((await resolveStructureRef(
						sourceQuery,
						child.ref,
						anchorStructure,
					)) as Scl.Ref<Scl.ElementsOf>)
				: undefined,
	}

	return resolveStandings({
		instances: applicationInstances,
		children,
		policy,
		decisionMappings: params.decisionMappings,
	})
}
