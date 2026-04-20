import { Scl } from '@/v2019C1/config'
import { getRefEntriesForTarget, updateRefsForEntry } from '@/v2019C1/hooks/shared'

/**
 * When a target element is updated (e.g. renamed), recompute path attrs
 * on all ref elements pointing to it via UUID.
 */
export async function updateRefPaths<GenericElement extends Scl.ElementsOf>(params: {
	oldRecord: Scl.RawRecord<GenericElement>
	newRecord: Scl.RawRecord<GenericElement>
	query: Scl.Query
}): Promise<Scl.Operation[]> {
	const { newRecord, query } = params

	const uuid = newRecord.attributes.find((a) => a.name === 'uuid')?.value
	if (!uuid) return []

	const refEntries = getRefEntriesForTarget(newRecord.tagName)
	if (refEntries.length === 0) return []

	const target = { tagName: newRecord.tagName, id: newRecord.id } as Scl.Ref<Scl.ElementsOf>
	const operations: Scl.Operation[] = []

	for (const entry of refEntries) {
		const ops = await updateRefsForEntry({ uuid, entry, target, query })
		operations.push(...ops)
	}

	return operations
}
