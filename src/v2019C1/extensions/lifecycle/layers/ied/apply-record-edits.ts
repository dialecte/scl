import type { RecordEdit } from './ied-process.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Apply attribute changes planned on source records to their written copies, through the clone mappings. */
export async function applyRecordEdits(
	tx: Core.Transaction<Config>,
	params: { edits: readonly RecordEdit[]; cloneMappings: readonly Scl.CloneMapping[] },
): Promise<void> {
	const targetOf = new Map(
		params.cloneMappings.map(function bySource(mapping) {
			return [mapping.source.id, mapping.target] as const
		}),
	)
	// `update` removes an attribute given `undefined`; the untyped surface takes string values only
	for (const edit of params.edits) {
		const target = targetOf.get(edit.ref.id)
		if (target)
			await tx.any.update(target, { attributes: edit.attributes as Record<string, string> })
	}
}
