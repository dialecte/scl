import { findInstanceUnder } from '../find-instance'
import { reconcileCrossCuttingSatellites } from './cross-cutting-satellites'
import { reconcileCarriedSatellites } from './function-satellites'

import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import {
	fsd as instantiateFsd,
	resolveTargetStructure,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'

import type { Scl, Config } from '@/v2019C1/config'
import type { AcceptedIds, CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide'
import type * as Core from '@dialecte/core'

/**
 * `update.fromFsd` — reconcile a project against a (possibly newer) FSD.
 *
 * Unifies instantiate and update (ENGINE.md §4, doc 02 §4: instantiate is the
 * first-time case of update):
 *  - if the target already holds an instance of this function (an element under
 *    `targetParent` whose `templateUuid` equals the source function's `uuid`),
 *    reconcile the updated template ONTO it (`engine.reconcile`);
 *  - otherwise instantiate it fresh (`instantiate.fsd`).
 *
 * `accepted` (optional) gates the write to the accepted decision groups: passed
 * through to `reconcile`, and for a first-time instantiate the whole function is
 * one group, so it is skipped unless its source id is accepted.
 */
export async function fsd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		targetParent: Scl.Ref<Scl.ElementsOf>
		accepted?: AcceptedIds
		overrides?: CollisionOverrides
	},
): Promise<void> {
	const { sourceQuery, functionRef, targetParent, accepted, overrides } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	const instance = await findInstanceUnder(tx, { targetParent, tagName: 'Function', sourceUuid })

	if (instance) {
		await reconcile(tx, {
			sourceQuery,
			sourceRootRef: functionRef,
			instanceRootRef: instance,
			accepted,
			overrides,
		})
		// carried satellites (e.g. FunctionCategory) travel with the function group
		await reconcileCarriedSatellites(tx, {
			sourceQuery,
			functionRef,
			instanceRef: instance,
			targetParent,
			accepted,
		})
		// cross-cutting satellites (Variable / BehaviorDescription applying to any subtree element)
		const structure = await resolveTargetStructure(tx, targetParent)
		await reconcileCrossCuttingSatellites(tx, {
			sourceQuery,
			primaryRef: functionRef,
			instancePrimaryRef: { tagName: 'Function', id: instance.id } as Scl.Ref<Scl.ElementsOf>,
			structure,
			accepted,
		})
		return
	}

	// first-time = one added group; gate the whole instantiate on its acceptance
	if (accepted && !accepted.sourceIds.has(functionRef.id)) return
	await instantiateFsd(tx, { sourceQuery, functionRef, targetParent, overrides })
}
