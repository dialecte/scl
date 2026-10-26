import { toRef } from '@dialecte/core/helpers'

import { isPrunedWhenEmpty } from '@/v2019C1/helpers/pruned-when-empty'
import { PRUNED_WHEN_EMPTY_TAGS } from '@/v2019C1/helpers/pruned-when-empty.constants'
import { holdsNothingBut } from '@/v2019C1/hooks/before-delete'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Delete every container of the document holding nothing — no child element, no text — that has no reason to stay
 * then (`isPrunedWhenEmpty`: a wrapper of the dialecte's own elements, an element whose definition needs a child), each walked
 * up: the wrapper a deleted category leaves empty goes too. Deleted through the transaction, so the delete hooks clean
 * what refers to a container removed. What a transaction empties is pruned at its commit anyway; this reaches what the
 * document held empty before (an extracted file).
 */
export async function pruneEmptyContainers(tx: Core.Transaction<Config>): Promise<void> {
	for (const tagName of PRUNED_WHEN_EMPTY_TAGS) {
		for (const record of await tx.getRecordsByTagName(tagName as Scl.ElementsOf)) {
			await pruneUpward(tx, { ref: toRef(record) as Scl.Ref<Scl.ElementsOf> })
		}
	}
}

/** Delete the container while it holds nothing, then its parent the same way. */
async function pruneUpward(
	tx: Core.Transaction<Config>,
	params: { ref: Scl.Ref<Scl.ElementsOf> },
): Promise<void> {
	let ref: Scl.Ref<Scl.ElementsOf> | undefined = params.ref
	while (ref && PRUNED_WHEN_EMPTY_TAGS.has(ref.tagName)) {
		const record: Scl.TrackedRecord<Scl.ElementsOf> | undefined = await tx.getRecord(ref)
		if (!record || !isPrunedWhenEmpty(record) || !holdsNothingBut({ record, gone: new Set() }))
			return
		if (!record.parent) return
		await tx.delete(ref)
		ref = toRef(record.parent) as Scl.Ref<Scl.ElementsOf>
	}
}
