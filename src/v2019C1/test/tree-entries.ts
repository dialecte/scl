import type { TreeEntry } from './tree-entries.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * Every element of a record tree (`query.getSnapshot({ as: 'tree' })`), the root first, in document order, each with
 * its ancestors: what a test reads of a document without parsing its XML.
 */
export function treeEntriesOf(tree: AnyTreeRecord): TreeEntry[] {
	const entries: TreeEntry[] = []
	const pending: TreeEntry[] = [{ record: tree, ancestors: [] }]
	while (pending.length > 0) {
		const entry = pending.pop()
		if (!entry) break
		entries.push(entry)
		const ancestors = [...entry.ancestors, entry.record]
		for (const child of [...entry.record.tree].reverse()) {
			pending.push({ record: child, ancestors })
		}
	}
	return entries
}
