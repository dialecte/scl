import { resolveInstanceHoldings } from './resolve-instance-holdings'

import { scopedId } from '@/v2019C1/extensions/lifecycle/engine/group'
import {
	findComposedFunctionRefs,
	findInstancesByTemplateUuid,
	findInstancesUnder,
} from '@/v2019C1/extensions/lifecycle/instance'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import { findHeldLevel } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type {
	ComposedFunction,
	ComposedFunctionChoice,
	ComposedFunctionStanding,
	ResolveComposedFunctionsParams,
} from './resolve-composed-functions.types'
import type { InstanceHoldings } from './resolve-instance-holdings.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * What stands, for each instance of the application, for each function its template composes —
 * the one answer the report announces and the update applies:
 *  - the functions an instance refers to are its own;
 *  - else, where that instance lives (the level of its other functions, else where the consumer
 *    started), the one function of that lineage no instance refers to is taken; with none, a new one
 *    is placed there; with several, nothing tells which: the consumer chooses one of them or a new
 *    one, and nothing is written for that instance until it did.
 * A function taken by an instance is no longer free for the next one. Each instance is read once.
 */
export async function resolveComposedFunctions(
	query: Core.Query<Config>,
	params: ResolveComposedFunctionsParams,
): Promise<ComposedFunction[]> {
	const { sourceQuery, applicationRef, applicationInstances, anchor, matchKey, decisionMappings } =
		params

	const functionRefs = await findComposedFunctionRefs(sourceQuery, applicationRef)
	if (functionRefs.length === 0) return []

	const sourceUuids = new Map<string, string | undefined>()
	const heldFunctions = new Map<string, AnyTrackedRecord[]>()
	for (const functionRef of functionRefs) {
		const sourceUuid = await sourceQuery.getAttribute(functionRef, { name: 'uuid' })
		sourceUuids.set(functionRef.id, sourceUuid)
		heldFunctions.set(
			functionRef.id,
			await findInstancesByTemplateUuid(query, { tagName: 'Function', sourceUuid, matchKey }),
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
	const composed: ComposedFunction[] = []
	for (const functionRef of functionRefs) {
		const sourceUuid = sourceUuids.get(functionRef.id)
		const claimed = new Set<string>()
		for (const instanceHoldings of holdings.values()) {
			for (const owned of instanceHoldings.ownedFunctions.get(functionRef.id) ?? []) {
				claimed.add(owned.id)
			}
		}

		const anchorLevel = anchorStructure
			? await resolveStructureRef(sourceQuery, functionRef, anchorStructure)
			: undefined
		const standings = new Map<string, ComposedFunctionStanding>()
		const choices = new Map<string, ComposedFunctionChoice>()
		for (const instance of applicationInstances) {
			const instanceHoldings = holdings.get(instance.id)
			if (!instanceHoldings) continue
			const owned = instanceHoldings.ownedFunctions.get(functionRef.id) ?? []
			if (owned.length > 0) {
				standings.set(instance.id, { kind: 'owned', functions: owned })
				continue
			}
			if (!sourceUuid) continue

			const heldLevel = await findHeldLevel(sourceQuery, {
				sourceRef: functionRef,
				heldLevels: instanceHoldings.heldLevels,
			})
			const level = heldLevel ?? anchorLevel
			// nowhere to look nor to place: nothing stands for it
			if (!level) continue
			const there = await findInstancesUnder(query, {
				targetParent: level,
				tagName: 'Function',
				sourceUuid,
				matchKey,
			})
			const free = there.filter((candidate) => !claimed.has(candidate.id))
			if (free.length > 1) {
				const decision = decisionMappings?.get(
					composedFunctionChoiceKey({ applicationInstance: instance, functionRef }),
				)
				choices.set(instance.id, { candidates: free, level, ...(decision ? { decision } : {}) })
				const chosen =
					decision && 'existing' in decision
						? free.find((candidate) => candidate.id === decision.existing.id)
						: undefined
				if (chosen) {
					claimed.add(chosen.id)
					standings.set(instance.id, { kind: 'taken', function: chosen })
				} else if (decision && 'create' in decision) {
					standings.set(instance.id, { kind: 'placed', level })
				} else {
					standings.set(instance.id, { kind: 'undecided' })
				}
			} else if (free.length === 1) {
				claimed.add(free[0].id)
				standings.set(instance.id, { kind: 'taken', function: free[0] })
			} else {
				standings.set(instance.id, { kind: 'placed', level })
			}
		}

		// what no instance stands on, where the consumer started
		const atAnchor =
			sourceUuid && anchorLevel
				? (
						await findInstancesUnder(query, {
							targetParent: anchorLevel,
							tagName: 'Function',
							sourceUuid,
							matchKey,
						})
					).filter((candidate) => !claimed.has(candidate.id))
				: []
		composed.push({ functionRef, sourceUuid, standings, choices, atAnchor })
	}
	return composed
}

/** The key of the consumer's choice of the function one instance of the application stands on. */
export function composedFunctionChoiceKey(params: {
	applicationInstance: { id: string }
	functionRef: { id: string }
}): string {
	return scopedId({ id: params.functionRef.id, scopePrefix: params.applicationInstance.id })
}
