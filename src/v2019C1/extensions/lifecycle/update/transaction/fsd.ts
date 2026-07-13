import { findFunctionInstance } from '../find-instance'

import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'

import type { Scl, Config } from '@/v2019C1/config'
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
 */
export async function fsd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		targetParent: Scl.Ref<Scl.ElementsOf>
	},
): Promise<void> {
	const { sourceQuery, functionRef, targetParent } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	const instance = await findFunctionInstance(tx, targetParent, sourceUuid)

	if (instance) {
		await reconcile(tx, { sourceQuery, sourceRootRef: functionRef, instanceRootRef: instance })
		return
	}

	await instantiateFsd(tx, { sourceQuery, functionRef, targetParent })
}
