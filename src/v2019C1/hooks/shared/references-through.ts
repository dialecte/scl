import { getRefEntriesForTarget, updateRefsForEntry } from './ref-entry-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Rebuild the paths of the references to `target`, found by its uuid. */
export async function rebuildReferencesTo(
	query: Core.Query<Config>,
	params: { target: Scl.Ref<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { target } = params
	const record = await query.getRecord(target)
	const uuid = record ? await query.any.getAttribute(record, { name: 'uuid' }) : undefined
	if (!uuid) return []

	const operations: Scl.Operation[] = []
	for (const entry of getRefEntriesForTarget(target.tagName)) {
		operations.push(...(await updateRefsForEntry({ uuid, entry, target, query })))
	}
	return operations
}

/**
 * Rebuild the paths of the references to every element below `record`: a change to its own
 * segment changes theirs.
 */
export async function rebuildReferencesBelow(
	query: Core.Query<Config>,
	params: { record: Scl.Ref<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { record } = params
	const descendants = await query.findDescendants(record)
	const operations: Scl.Operation[] = []

	for (const records of Object.values(descendants) as Scl.TrackedRecord<Scl.ElementsOf>[][]) {
		for (const descendant of records) {
			if (descendant.id === record.id) continue
			if (getRefEntriesForTarget(descendant.tagName).length === 0) continue
			const target = { tagName: descendant.tagName, id: descendant.id } as Scl.Ref<Scl.ElementsOf>
			operations.push(...(await rebuildReferencesTo(query, { target })))
		}
	}

	return operations
}
