import type { ProcessIndex } from './ied-process.types'

/**
 * The elements of the process part an IED export writes: those of its roots' subtrees that are not left out and
 * whose parent is written. The elements are read a parent before its children, so one pass decides.
 */
export function keptProcessIds(params: {
	index: ProcessIndex
	leaveOut: ReadonlySet<string>
}): ReadonlySet<string> {
	const { index, leaveOut } = params
	const kept = new Set<string>()
	const rootIds = new Set(
		index.roots.map(function idOf(root) {
			return root.record.id
		}),
	)
	for (const { record, ancestry } of index.nodes) {
		if (leaveOut.has(record.id)) continue
		const parent = ancestry.at(-1)
		if (rootIds.has(record.id) || (parent && kept.has(parent.id))) kept.add(record.id)
	}
	return kept
}
