import { EVERY_TAG } from './copy.constants'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The subtrees a copy is made of, each in document order, read in one walk whatever their number: the roots in one read,
 * what they hold in one read per level over all of them. A ref the document does not hold reads nothing.
 */
export async function readCopyTrees(
	query: Core.Query<Config>,
	params: { refs: readonly Scl.Ref<Scl.ElementsOf>[] },
): Promise<AnyTreeRecord[]> {
	const { refs } = params
	if (refs.length === 0) return []
	const roots = await query.any.getRecords([...refs])
	const below = (await query.findDescendantsOfEach([...refs], {
		collect: EVERY_TAG,
	} as never)) as unknown as Readonly<Record<string, readonly AnyTrackedRecord[] | undefined>>[]
	return roots.flatMap(function treeOf(root, position): AnyTreeRecord[] {
		if (!root) return []
		const held = new Map(
			Object.values(below[position] ?? {})
				.flatMap((records) => records ?? [])
				.map((record) => [record.id, record] as const),
		)
		return [assemble({ record: root, held })]
	})
}

/** A record and what it holds, in the order its children are listed. */
function assemble(params: {
	record: AnyTrackedRecord
	held: ReadonlyMap<string, AnyTrackedRecord>
}): AnyTreeRecord {
	const { record, held } = params
	const tree = record.children.flatMap(function childOf(child): AnyTreeRecord[] {
		const childRecord = held.get(child.id)
		return childRecord ? [assemble({ record: childRecord, held })] : []
	})
	return { ...record, tree } as AnyTreeRecord
}
