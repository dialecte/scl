import { PATH_CONTRIBUTING_ATTRIBUTES } from '@/v2019C1/extensions/reference'
import { getRefEntriesForTarget, updateRefsForEntry } from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * When a target element is updated (e.g. renamed), recompute path attrs
 * on all ref elements pointing to it via UUID.
 *
 * Also handles ancestor renames: when a path-contributing attribute changes,
 * rebuilds ref paths for all descendant targets (e.g. renaming a Bay updates
 * FunctionRef paths that pass through it).
 */
export async function updateRefPaths<GenericElement extends Scl.ElementsOf>(params: {
	oldRecord: Scl.RawRecord<GenericElement>
	newRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, query } = params
	const operations: Scl.Operation[] = []

	const uuid = newRecord.attributes.find((a) => a.name === 'uuid')?.value
	if (uuid) {
		const refEntries = getRefEntriesForTarget(newRecord.tagName)
		const target = { tagName: newRecord.tagName, id: newRecord.id } as Scl.Ref<Scl.ElementsOf>
		for (const entry of refEntries) {
			const ops = await updateRefsForEntry({ uuid, entry, target, query })
			operations.push(...ops)
		}
	}

	if (hasPathAttributeChange(oldRecord, newRecord)) {
		const ops = await updateDescendantRefPaths({ newRecord, query })
		operations.push(...ops)
	}

	return operations
}

function hasPathAttributeChange<GenericElement extends Scl.ElementsOf>(
	oldRecord: Scl.RawRecord<GenericElement>,
	newRecord: Scl.RawRecord<GenericElement>,
): boolean {
	for (const attrName of PATH_CONTRIBUTING_ATTRIBUTES) {
		const oldVal = oldRecord.attributes.find((a) => a.name === attrName)?.value
		const newVal = newRecord.attributes.find((a) => a.name === attrName)?.value
		if (oldVal !== newVal) return true
	}
	return false
}

async function updateDescendantRefPaths<GenericElement extends Scl.ElementsOf>(params: {
	newRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { newRecord, query } = params
	const ref = { tagName: newRecord.tagName, id: newRecord.id } as Scl.Ref<GenericElement>
	const descendants = await query.findDescendants(ref)
	const operations: Scl.Operation[] = []

	for (const records of Object.values(descendants) as Scl.TrackedRecord<Scl.ElementsOf>[][]) {
		for (const record of records) {
			if (record.id === newRecord.id) continue

			const descendantUuid = await query.any.getAttribute(record, { name: 'uuid' })
			if (!descendantUuid) continue

			const refEntries = getRefEntriesForTarget(record.tagName)
			if (refEntries.length === 0) continue

			const target = { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>
			for (const entry of refEntries) {
				const ops = await updateRefsForEntry({ uuid: descendantUuid, entry, target, query })
				operations.push(...ops)
			}
		}
	}

	return operations
}
