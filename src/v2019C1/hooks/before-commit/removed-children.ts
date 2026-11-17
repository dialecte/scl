import type { RemovedChild, RemovedChildren } from './removed-children.types'
import type { Scl } from '@/v2019C1/config'

/**
 * The children the transaction took out of each element, by the element, each once: a deleted child, a child its parent
 * no longer lists (an update whose children shrank, as a move leaves its former parent), a child whose parent changed.
 */
export function removedChildrenByParent(params: {
	operations: ReadonlyArray<Scl.Operation>
}): Map<string, RemovedChildren> {
	const byParent = new Map<string, RemovedChildren>()
	const deleted = new Set(
		params.operations.flatMap((operation) =>
			operation.status === 'deleted' ? [operation.oldRecord.id] : [],
		),
	)
	for (const operation of params.operations) {
		for (const { parent, child } of removalsOf({ operation, deleted })) {
			if (!parent.id) continue
			const entry = byParent.get(parent.id) ?? { parent, children: [] }
			if (entry.children.some((known) => known.id === child.id)) continue
			byParent.set(parent.id, { ...entry, children: [...entry.children, child] })
		}
	}
	return byParent
}

/**
 * The children an operation took out of an element: a delete's own record from its parent; for an update, the children
 * its record no longer lists (moved away) and, when its own parent changed, itself from its former parent.
 */
function removalsOf(params: {
	operation: Scl.Operation
	/** The records the transaction deleted: a parent's update that no longer lists one is that delete, no move. */
	deleted: ReadonlySet<string>
}): { parent: Scl.Ref<Scl.ElementsOf>; child: RemovedChild }[] {
	const { operation, deleted } = params
	if (operation.status === 'created') return []
	const before = operation.oldRecord
	const parent = before.parent as Scl.Ref<Scl.ElementsOf> | null
	const own = { tagName: before.tagName, id: before.id }
	if (operation.status === 'deleted')
		return parent ? [{ parent, child: { ...own, by: 'deleted' } }] : []
	const after = operation.newRecord
	const listed = new Set(after.children.map((child) => child.id))
	const element = own as Scl.Ref<Scl.ElementsOf>
	const shrunk = before.children
		.filter((child) => !listed.has(child.id) && !deleted.has(child.id))
		.map((child) => ({
			parent: element,
			child: { tagName: child.tagName, id: child.id, by: 'moved' as const },
		}))
	const movedAway =
		parent && after.parent?.id !== parent.id
			? [{ parent, child: { ...own, by: 'moved' as const } }]
			: []
	return [...shrunk, ...movedAway]
}
