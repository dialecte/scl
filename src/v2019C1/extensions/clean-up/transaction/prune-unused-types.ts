import { collectUnusedTypes } from '@/v2019C1/extensions/data-model/query/unused-types'
import { TYPE_ID_TARGET_TAGS } from '@/v2019C1/extensions/reference'
import { readAttribute } from '@/v2019C1/helpers'

import type { Config, Scl } from '@/v2019C1/config'
import type { TypeIdTarget } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * Delete every type of the document nothing names (an `LNodeType`, `DOType`, `DAType` or `EnumType`), then the
 * types they alone named, through the transaction so the delete hooks run. What a transaction leaves unused is pruned
 * at its commit anyway; this reaches what the document held unused before (an imported file).
 *
 * @intent remove the data types nothing in the document uses, tidy up the DataTypeTemplates of an imported file
 */
export async function pruneUnusedTypes(tx: Core.Transaction<Config>): Promise<void> {
	const names = new Map<string, TypeIdTarget[]>()
	for (const tagName of TYPE_ID_TARGET_TAGS) {
		for (const record of await tx.getRecordsByTagName(tagName as TypeIdTarget)) {
			const typeId = readAttribute({ record, name: 'id', defaults: 'none' })
			if (typeId) names.set(typeId, [...(names.get(typeId) ?? []), tagName as TypeIdTarget])
		}
	}
	const { trees } = await collectUnusedTypes({ query: tx, names, gone: new Set() })
	for (const { root } of trees) {
		await tx.delete({ tagName: root.tagName, id: root.id } as Scl.Ref<Scl.ElementsOf>)
	}
}
