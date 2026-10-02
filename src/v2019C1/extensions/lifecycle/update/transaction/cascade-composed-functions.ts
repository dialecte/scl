import { fsd as updateFsd } from './fsd'

import {
	collectInstanceScope,
	findComposedFunctionRefs,
	findInstancesByTemplateUuid,
	findInstancesUnder,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { findHeldLevel, resolveHeldLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { matchKeyForScenario } from '@/v2019C1/extensions/lifecycle/scenario'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type {
	ApplicationInstance,
	CascadeComposedFunctionsParams,
	ComposedFunctionsCascade,
	InstanceHoldings,
} from './cascade-composed-functions.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { InstanceCounterpart } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Function-layer cascade of an application update: every function the template composes is
 * reconciled where the project holds it, and placed where it does not.
 *
 * Several instances of the application may exist, each with its own functions, each in its own
 * bay. A function is therefore handled per instance:
 *  - the functions an instance refers to are its own: each is reconciled where it sits;
 *  - a function the template gained is new to every instance: each instance the update writes to
 *    gets its own, on the level that instance lives on — in the bay of its other functions, not
 *    under the element the update was started from. A function of that lineage already there that
 *    belongs to no instance is taken instead of a new one;
 *  - a function that belongs to no instance is reconciled when it sits where the consumer started.
 *
 * The references an instance gained to such a function are repointed by the caller, from the
 * redirect mappings returned for that instance.
 */
export async function cascadeComposedFunctions(
	tx: Core.Transaction<Config>,
	params: CascadeComposedFunctionsParams,
): Promise<ComposedFunctionsCascade> {
	const { sourceQuery, applicationRef, targetParent, applicationInstances, targetInstance } = params
	const matchKey = matchKeyForScenario(params.scenario)

	const cascade: ComposedFunctionsCascade = { functions: [], redirectMappings: new Map() }
	const functionRefs = await findComposedFunctionRefs(sourceQuery, applicationRef)
	if (functionRefs.length === 0) return cascade

	const sourceUuids = new Map<string, string | undefined>()
	const heldFunctions = new Map<string, AnyTrackedRecord[]>()
	for (const functionRef of functionRefs) {
		const sourceUuid = await sourceQuery.getAttribute(functionRef, { name: 'uuid' })
		const held = await findInstancesByTemplateUuid(tx, {
			tagName: 'Function',
			sourceUuid,
			matchKey,
		})
		sourceUuids.set(functionRef.id, sourceUuid)
		heldFunctions.set(functionRef.id, held)
	}

	const holdings = new Map<string, InstanceHoldings>()
	for (const applicationInstance of applicationInstances) {
		const instanceHoldings = await resolveInstanceHoldings(tx, {
			sourceQuery,
			applicationRef,
			applicationInstance,
			functionRefs,
			heldFunctions,
		})
		holdings.set(applicationInstance.instance.id, instanceHoldings)
	}

	const anchorStructure = await resolveTargetStructure(tx, targetParent)

	for (const functionRef of functionRefs) {
		const sourceUuid = sourceUuids.get(functionRef.id)
		// the functions of the project to reconcile, and those an instance already calls its own
		const reconcilables = new Map<string, AnyTrackedRecord>()
		const claimed = new Set<string>()
		for (const instanceHoldings of holdings.values()) {
			for (const owned of instanceHoldings.ownedFunctions.get(functionRef.id) ?? []) {
				reconcilables.set(owned.id, owned)
				claimed.add(owned.id)
			}
		}

		const anchorLevel = await resolveStructureRef(sourceQuery, functionRef, anchorStructure)

		// new to an instance: one per instance, on the level that instance lives on
		for (const { instance, written } of applicationInstances) {
			const instanceHoldings = holdings.get(instance.id)
			if (!written || !instanceHoldings || !sourceUuid) continue
			if ((instanceHoldings.ownedFunctions.get(functionRef.id) ?? []).length > 0) continue

			const heldLevel = await findHeldLevel(sourceQuery, {
				sourceRef: functionRef,
				heldLevels: instanceHoldings.heldLevels,
			})
			const level = heldLevel ?? anchorLevel
			const there = await findInstancesUnder(tx, {
				targetParent: level,
				tagName: 'Function',
				sourceUuid,
				matchKey,
			})
			const free = there.filter((candidate) => !claimed.has(candidate.id))
			// several qualify and nothing singles one out: none is taken, none is added
			if (free.length > 1) continue

			let standsFor: Scl.Ref<Scl.ElementsOf>
			if (free.length === 1) {
				reconcilables.set(free[0].id, free[0])
				claimed.add(free[0].id)
				standsFor = { tagName: 'Function', id: free[0].id } as Scl.Ref<Scl.ElementsOf>
			} else {
				const [placed] = await updateFsd(tx, {
					sourceQuery,
					functionRef,
					targetParent: level,
					// a fresh one, whatever another instance holds
					scenario: 'instantiate',
					report: params.report,
					decisions: params.decisions,
					keepNameTypesFrom: params.keepNameTypesFrom,
					decisionMappings: params.decisionMappings,
				})
				if (!placed?.id) continue
				cascade.functions.push(placed)
				standsFor = placed
				claimed.add(placed.id)
			}
			const instanceRedirects = cascade.redirectMappings.get(instance.id) ?? []
			instanceRedirects.push({ sourceUuid, target: standsFor })
			cascade.redirectMappings.set(instance.id, instanceRedirects)
		}

		// a function no instance calls its own, where the consumer started
		const atAnchor = await findInstancesUnder(tx, {
			targetParent: anchorLevel,
			tagName: 'Function',
			sourceUuid,
			matchKey,
		})
		for (const candidate of atAnchor) {
			if (!claimed.has(candidate.id)) reconcilables.set(candidate.id, candidate)
		}

		const scoped = await scopeToTargetInstance(tx, {
			instances: [...reconcilables.values()],
			targetInstance,
		})
		for (const functionInstance of scoped) {
			const reconciled = await reconcileWhereItSits(tx, { params, functionRef, functionInstance })
			cascade.functions.push(...reconciled)
		}
	}

	return cascade
}

/** What one instance of the application holds: its own functions and the levels it lives on. */
async function resolveInstanceHoldings(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		applicationInstance: ApplicationInstance
		functionRefs: readonly Scl.Ref<'Function'>[]
		/** Every function of the project carrying the lineage of a source function, by its record id. */
		heldFunctions: ReadonlyMap<string, readonly AnyTrackedRecord[]>
	},
): Promise<InstanceHoldings> {
	const { sourceQuery, applicationRef, applicationInstance, functionRefs, heldFunctions } = params
	const { instance } = applicationInstance

	// what tells the functions of this instance from another instance's: its references
	const instanceScope = await collectInstanceScope(tx, instance)

	const ownedFunctions = new Map<string, AnyTrackedRecord[]>()
	const counterparts: InstanceCounterpart[] = []
	for (const functionRef of functionRefs) {
		const held = heldFunctions.get(functionRef.id) ?? []
		const owned = held.filter((candidate) => instanceScope.has(candidate.id))
		ownedFunctions.set(functionRef.id, owned)
		for (const ownedFunction of owned) {
			counterparts.push({
				source: functionRef,
				instance: { tagName: 'Function', id: ownedFunction.id } as Scl.Ref<Scl.ElementsOf>,
			})
		}
	}
	// its functions say where it lives; the application itself, for the levels they do not tell
	counterparts.push({
		source: applicationRef,
		instance: { tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>,
	})

	const heldLevels = await resolveHeldLevels(tx, { sourceQuery, counterparts })
	return { ownedFunctions, heldLevels }
}

/** Reconcile one function of the project against its source function, under the element it sits in. */
async function reconcileWhereItSits(
	tx: Core.Transaction<Config>,
	context: {
		params: CascadeComposedFunctionsParams
		functionRef: Scl.Ref<'Function'>
		functionInstance: AnyTrackedRecord
	},
): Promise<(Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]> {
	const { params, functionRef, functionInstance } = context

	const functionInstanceRef = {
		tagName: 'Function',
		id: functionInstance.id,
	} as Scl.Ref<Scl.ElementsOf>
	const parent = functionInstance.parent
	if (!parent) return []

	return updateFsd(tx, {
		sourceQuery: params.sourceQuery,
		functionRef,
		targetParent: { tagName: parent.tagName, id: parent.id } as Scl.Ref<Scl.ElementsOf>,
		scenario: params.scenario,
		report: params.report,
		decisions: params.decisions,
		keepNameTypesFrom: params.keepNameTypesFrom,
		targetInstance: functionInstanceRef,
		decisionMappings: params.decisionMappings,
	})
}
