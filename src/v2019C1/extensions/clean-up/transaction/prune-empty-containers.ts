import { REF_CONTAINERS } from '@/v2019C1/extensions/reference'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Removes empty containers: REF_CONTAINERS entries (inner→outer) and Private elements.
 *
 * When all children of a ref type are deleted, their container
 * hierarchy may become empty. Private elements emptied by ref cleanup are also pruned.
 */
export async function pruneEmptyContainers(tx: Core.Transaction<Config>): Promise<void> {
	const tagNames = [...Object.values(REF_CONTAINERS).flat(), 'Private']

	for (const tagName of tagNames) {
		const containers = await tx.getRecordsByTagName(tagName as Scl.ElementsOf)

		for (const container of containers) {
			if (container.children.length === 0) await tx.delete(container)
		}
	}
}
