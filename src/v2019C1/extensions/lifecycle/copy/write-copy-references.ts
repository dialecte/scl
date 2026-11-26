import type { WriteCopyReferencesParams } from './copy.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Write a copy's reference plan on the copy, each source element found through the clone mappings: a holder left out is
 * deleted, a reduced one gets its link removed and its expected data written. A source element with no copy (its root
 * skipped) asks nothing.
 */
export async function writeCopyReferences(
	tx: Core.Transaction<Config>,
	params: WriteCopyReferencesParams,
): Promise<void> {
	const { plan, cloneMappings } = params
	if (plan.leaveOut.size === 0 && plan.edits.length === 0) return
	const copyOf = new Map(
		cloneMappings.map((mapping) => [mapping.source.id ?? '', mapping.target] as const),
	)
	for (const edit of plan.edits) {
		const target = copyOf.get(edit.ref.id ?? '')
		// `update` removes an attribute given `undefined`; the untyped surface takes string values only
		if (target)
			await tx.any.update(target, { attributes: edit.attributes as Record<string, string> })
	}
	// the copies to delete, read once: one already gone with what held it is not deleted again
	const left = [...plan.leaveOut].flatMap((sourceId) => {
		const target = copyOf.get(sourceId)
		return target ? [target] : []
	})
	const records = await tx.any.getRecords(left)
	for (const record of records) if (record) await tx.any.delete(record)
}
