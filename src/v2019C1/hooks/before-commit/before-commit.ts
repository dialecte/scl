import { ensureLNodeSpecNaming } from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Once the transaction's work is done, every LNode it created and still holds carries an
 * `LNodeSpecNaming`: one brought by a copy or added by the caller is kept, the others get one from
 * the LNode's own naming. Run here, not on create: when an LNode is created, its children (a copied
 * `LNodeSpecNaming` among them) are not added yet.
 */
export async function beforeCommit(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { operations, query } = params
	const created = new Set<string>()
	for (const operation of operations) {
		if (operation.status === 'created' && operation.newRecord.tagName === 'LNode') {
			created.add(operation.newRecord.id)
		}
	}

	const ensured: Scl.Operation[] = []
	for (const id of created) {
		ensured.push(...(await ensureLNodeSpecNaming(query, { lnode: { tagName: 'LNode', id } })))
	}
	return ensured
}
