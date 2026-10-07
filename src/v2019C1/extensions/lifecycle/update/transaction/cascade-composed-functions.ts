import { fsd as updateFsd } from './fsd'

import { toRef } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { scopeToTargetInstance } from '@/v2019C1/extensions/lifecycle/instance'
import { resolveComposedFunctions } from '@/v2019C1/extensions/lifecycle/layers/application'
import { matchKeyForScenario } from '@/v2019C1/extensions/lifecycle/scenario'

import type {
	CascadeComposedFunctionsParams,
	ComposedFunctionsCascade,
} from './cascade-composed-functions.types'
import type { Config, Scl } from '@/v2019C1/config'
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
 *    belongs to no instance is taken instead of a new one; with several, the consumer chose;
 *  - a function that belongs to no instance is reconciled when it sits where the consumer started.
 *
 * What stands for each function, per instance, is {@link resolveComposedFunctions}: the answer the
 * report announced. The references an instance gained to such a function are repointed by the
 * caller, from the redirect mappings returned for that instance.
 */
export async function cascadeComposedFunctions(
	tx: Core.Transaction<Config>,
	params: CascadeComposedFunctionsParams,
): Promise<ComposedFunctionsCascade> {
	const { sourceQuery, applicationRef, targetParent, applicationInstances, targetInstance } = params

	const cascade: ComposedFunctionsCascade = { functions: [], redirectMappings: new Map() }
	// what stands for each composed function, per instance: the answer the report announced
	const composedFunctions = await resolveComposedFunctions(tx, {
		sourceQuery,
		applicationRef,
		applicationInstances: applicationInstances.map(({ instance }) => instance),
		anchor: targetParent,
		matchKey: matchKeyForScenario(params.scenario),
		decisionMappings: params.decisionMappings,
	})

	for (const { functionRef, sourceUuid, standings, atAnchor } of composedFunctions) {
		// the functions of the project to reconcile
		const reconcilables = new Map<string, AnyTrackedRecord>()
		for (const { instance, written } of applicationInstances) {
			const standing = standings.get(instance.id)
			if (!standing) continue
			if (standing.kind === 'owned') {
				for (const owned of standing.functions) reconcilables.set(owned.id, owned)
				continue
			}
			if (!written || !sourceUuid) continue
			// several qualify where the instance lives: nothing is written until the consumer chose
			invariant(standing.kind !== 'undecided', {
				key: SCL_ERRORS.MAPPING_UNDECIDED,
				meta: { sourceId: functionRef.id, tagName: functionRef.tagName, kind: 'shared' },
				detail: `which <Function> "${functionRef.id}" the application instance "${instance.id}" stands on is not decided: several functions of that lineage qualify, choose one or have a new one placed`,
			})

			let standsFor: Scl.Ref<Scl.ElementsOf>
			if (standing.kind === 'taken') {
				reconcilables.set(standing.function.id, standing.function)
				standsFor = toRef(standing.function) as Scl.Ref<Scl.ElementsOf>
			} else {
				const [placed] = await updateFsd(tx, {
					sourceQuery,
					functionRef,
					targetParent: standing.level,
					// a fresh one, whatever another instance holds
					scenario: 'instantiate',
					// placed as part of the application template: its provenance is the application's
					partOfTemplate: true,
					// listed by the report once per instance of the application
					placedFor: toRef(instance) as Scl.Ref<Scl.ElementsOf>,
					report: params.report,
					decisions: params.decisions,
					keepNameTypesFrom: params.keepNameTypesFrom,
					decisionMappings: params.decisionMappings,
				})
				if (!placed?.id) continue
				cascade.functions.push(placed)
				standsFor = placed
			}
			const instanceRedirects = cascade.redirectMappings.get(instance.id) ?? []
			instanceRedirects.push({ sourceUuid, target: standsFor })
			cascade.redirectMappings.set(instance.id, instanceRedirects)
		}
		for (const unowned of atAnchor) reconcilables.set(unowned.id, unowned)

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
