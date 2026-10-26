import { findOrphanedRefs } from '@/v2019C1/hooks/before-delete'

import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionGroup,
	DiffNode,
	RemovalSideEffect,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * Write on each group that removes elements what its removal makes the delete hooks do outside them
 * (`DecisionGroup.sideEffects`): the references elsewhere in the project naming a removed element, deleted or
 * cleared — as `findOrphanedRefs` reads them for the hook. A reference inside what the group removes goes with it
 * and is not listed.
 */
export async function listRemovalSideEffects(
	query: Core.Query<Config>,
	params: { groups: readonly DecisionGroup[] },
): Promise<void> {
	for (const group of params.groups) {
		const sideEffects = await readSideEffects(query, { group })
		if (sideEffects.length > 0) group.sideEffects = sideEffects
	}
}

async function readSideEffects(
	query: Core.Query<Config>,
	params: { group: DecisionGroup },
): Promise<RemovalSideEffect[]> {
	const { group } = params
	const removed: Scl.Ref<Scl.ElementsOf>[] = []
	for (const node of [group.primary, ...group.companions]) {
		const { instanceRef } = node
		if (!removes(node) || !instanceRef?.id) continue
		removed.push({ tagName: instanceRef.tagName, id: instanceRef.id } as Scl.Ref<Scl.ElementsOf>)
	}
	const removedIds = new Set<string>()
	for (const ref of removed) {
		const tree = await query.any.getTree(ref)
		if (tree) collectIds({ node: tree, ids: removedIds })
	}

	const sideEffects = new Map<string, RemovalSideEffect>()
	for (const ref of removed) {
		const record = await query.getRecord(ref)
		if (!record) continue
		for (const orphaned of await findOrphanedRefs({ record, query })) {
			const { id, tagName } = orphaned.record
			if (removedIds.has(id) || sideEffects.has(id)) continue
			sideEffects.set(id, { element: { tagName, id }, effect: orphaned.effect })
		}
	}
	return [...sideEffects.values()]
}

/** Whether accepting a node deletes the element it names: a removal, or an element of the project's own. */
function removes(node: DiffNode): boolean {
	return node.change === 'removed' || node.change === 'target-only'
}

function collectIds(params: { node: AnyTreeRecord; ids: Set<string> }): void {
	const { node, ids } = params
	ids.add(node.id)
	for (const child of node.tree) collectIds({ node: child, ids })
}
