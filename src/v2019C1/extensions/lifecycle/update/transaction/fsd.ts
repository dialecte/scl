import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'

import type { Scl } from '@/v2019C1/config'
import type { AnyTreeRecord } from '@dialecte/core'

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
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		functionRef: Scl.Ref<'Function'>
		targetParent: Scl.Ref<Scl.ElementsOf>
	},
): Promise<void> {
	const { sourceQuery, functionRef, targetParent } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)

	const parentTree = await tx.any.getTree(targetParent)
	const instance = parentTree ? await findInstance(tx, parentTree, sourceUuid) : undefined

	if (instance) {
		await reconcile(tx, { sourceQuery, sourceRootRef: functionRef, instanceRootRef: instance })
		return
	}

	await instantiateFsd(tx, { sourceQuery, functionRef, targetParent })
}

/** First `Function` descendant whose `templateUuid` equals the source uuid. */
async function findInstance(
	tx: Scl.Transaction,
	node: AnyTreeRecord,
	sourceUuid: string | undefined,
): Promise<AnyTreeRecord | undefined> {
	if (
		node.tagName === 'Function' &&
		(await tx.any.getAttribute(node, { name: 'templateUuid' })) === sourceUuid
	) {
		return node
	}
	for (const child of node.tree) {
		const found = await findInstance(tx, child, sourceUuid)
		if (found) return found
	}
	return undefined
}
