import { toRef } from '@dialecte/core/helpers'

import { readAttribute } from '@/v2019C1/helpers'

import type { DecisionGroup, DiffNode } from './diff.types'
import type {
	FindMovedInAddedParams,
	LinkMovesParams,
	MovedInAdded,
	PendingMove,
	ReplaceAddedParams,
} from './moved.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The descendants of an added source subtree that pair, through the instance index, with an instance element
 * elsewhere: each moves to where the source puts it under the added parent, so the parent's clone leaves it out and no
 * uuid is held twice. A descendant inside a moved one is the moved one's: not listed on its own.
 */
export function findMovedInAdded(params: FindMovedInAddedParams): MovedInAdded[] {
	const { index } = params
	const found: MovedInAdded[] = []
	const pending = params.node.tree.map((child) => ({ child, parent: params.node }))
	while (pending.length > 0) {
		const next = pending.pop()
		if (!next) continue
		const uuid = readAttribute({ record: next.child, name: 'uuid', defaults: 'none' })
		const instance = uuid ? index.get(uuid) : undefined
		if (instance) {
			found.push({ source: next.child, instance, sourceParent: next.parent })
			continue
		}
		pending.push(...next.child.tree.map((child) => ({ child, parent: next.child })))
	}
	return found
}

/** The added subtree with the node of `sourceId` replaced by `moved`, as a new tree. */
export function replaceAdded(params: ReplaceAddedParams): DiffNode {
	const { node, sourceId, moved } = params
	if (node.sourceRef?.id === sourceId) return moved
	return {
		...node,
		children: node.children.map((child) => replaceAdded({ node: child, sourceId, moved })),
	}
}

/**
 * What a move waits for, and what waits for it, read from one diff's groups:
 *  - a move into an added parent depends on that parent's group (the parent must exist to move into it);
 *  - a removal of an element a moved one still sits in depends on the move (accepting the removal with the move
 *    skipped would take the moved element with it).
 * Returns the groups with those dependencies added, each id once.
 */
export function linkMoveDependencies(params: LinkMovesParams): DecisionGroup[] {
	const { groups } = params
	const parentOf = parentsById(params.instanceTree)
	const addedBySource = new Map(
		groups.flatMap((group) =>
			group.change === 'added' && group.primary.sourceRef?.id
				? [[group.primary.sourceRef.id, group] as const]
				: [],
		),
	)
	const removalByInstance = new Map(
		groups.flatMap((group) =>
			(group.change === 'removed' || group.change === 'target-only') &&
			group.primary.instanceRef?.id
				? [[group.primary.instanceRef.id, group] as const]
				: [],
		),
	)
	const extra = new Map<string, string[]>()
	for (const group of groups) {
		if (group.change !== 'moved') continue
		const parent = group.primary.movedTo?.id
			? addedBySource.get(group.primary.movedTo.id)
			: undefined
		if (parent) extra.set(group.id, [...(extra.get(group.id) ?? []), parent.id])
		let ancestor = group.primary.movedFrom?.id
		while (ancestor) {
			const removal = removalByInstance.get(ancestor)
			if (removal) extra.set(removal.id, [...(extra.get(removal.id) ?? []), group.id])
			ancestor = parentOf.get(ancestor)
		}
	}
	return groups.map(function withMoveDependencies(group) {
		const added = extra.get(group.id)
		if (!added) return group
		return { ...group, dependsOn: [...new Set([...group.dependsOn, ...added])] }
	})
}

/** Each element's parent id, over a tree. */
function parentsById(tree: AnyTreeRecord): ReadonlyMap<string, string> {
	const parents = new Map<string, string>()
	const pending = [tree]
	while (pending.length > 0) {
		const node = pending.pop()
		if (!node) continue
		for (const child of node.tree) {
			parents.set(child.id, node.id)
			pending.push(child)
		}
	}
	return parents
}

/**
 * Write the accepted moves of a reconcile, each with core's `tx.move` under its new parent: the record keeps its id,
 * the commit's steps make what names it follow. Run once the walk has added what a move may land in, before the
 * removals.
 */
export async function writeMoves(
	tx: Core.Transaction<Config>,
	params: { moves: readonly PendingMove[] },
): Promise<void> {
	for (const move of params.moves) {
		// the element and its parent are of tags the walk read: `any` takes them as they are
		await tx.any.move(toRef(move.instance), { parent: move.parent })
	}
}
