import { instanceTagOf } from './instance-tag'

import { toRef } from '@dialecte/core/helpers'

import { readAttribute } from '@/v2019C1/helpers'
import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'

import type { DecisionGroup, DiffNode } from './diff.types'
import type {
	FindMovedInAddedParams,
	MovableSourceParams,
	MovedOutParams,
	ElementRef,
	PrunedBelowParams,
	TopmostBelowParams,
	TreeParentsBelowParams,
	WithoutMovedOutParams,
	LinkMovesParams,
	MovedInAdded,
	ReplaceAddedParams,
	TreeParentsParams,
	WriteMovesParams,
} from './moved.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The descendants of an added source subtree that pair, through the instance index, with an instance element
 * elsewhere: each moves to where the source puts it under the added parent, so the parent's clone leaves it out and no
 * uuid is held twice. A descendant inside a moved one is the moved one's: not listed on its own.
 */
export function findMovedInAdded(params: FindMovedInAddedParams): MovedInAdded[] {
	const { index, omit, notSelected } = params
	const found: MovedInAdded[] = []
	const pending = params.node.tree.map((child) => ({ child, parent: params.node }))
	while (pending.length > 0) {
		const next = pending.pop()
		if (!next) continue
		// a boundary another pass owns, or what the selection of variants leaves out, is not this addition's
		if (omit?.includes(next.child.tagName) || notSelected?.has(next.child.id)) continue
		const uuid = readAttribute({ record: next.child, name: 'uuid', defaults: 'none' })
		const indexed = uuid ? index.get(uuid) : undefined
		// paired as the walk pairs a child: an element of the tag the source element stands for
		const instance = indexed?.tagName === instanceTagOf(next.child.tagName) ? indexed : undefined
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
	// every element a group adds, its primary's subtree and its companions', names that group
	const addedBySource = new Map(
		groups.flatMap((group) =>
			[group.primary, ...group.companions].flatMap((node) =>
				addedSourceIds(node).map((id) => [id, group] as const),
			),
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

/** The source ids of the added nodes of a diff subtree, the node itself included when added. */
function addedSourceIds(node: DiffNode): string[] {
	// what a moved element holds is its own group's, not the addition it lands in
	if (node.change === 'moved') return []
	const own = node.change === 'added' && node.sourceRef?.id ? [node.sourceRef.id] : []
	return [...own, ...node.children.flatMap(addedSourceIds)]
}

/**
 * The diff's tree with each move's old parent named as the walk sees it: an element held in a transparent wrapper
 * (`Private`) moved from the element holding the wrapper, not from the wrapper.
 */
export function withTreeParents(params: TreeParentsParams): DiffNode {
	const parentOf = treeParentRefs(params.instanceTree)
	return withTreeParentsBelow({ node: params.root, parentOf })
}

function withTreeParentsBelow(params: TreeParentsBelowParams): DiffNode {
	const { node, parentOf } = params
	const children = node.children.map((child) => withTreeParentsBelow({ node: child, parentOf }))
	// by tag: for a vendor's Private of another namespace the tree parent taken is that Private itself (the tree keeps it)
	const wrapped =
		node.change === 'moved' &&
		node.movedFrom?.tagName !== undefined &&
		isTransparentElement(node.movedFrom.tagName)
	const treeParent = wrapped && node.instanceRef?.id ? parentOf.get(node.instanceRef.id) : undefined
	return treeParent ? { ...node, movedFrom: treeParent, children } : { ...node, children }
}

/** Each element's parent as the walk sees it (through transparent wrappers), over a tree. */
function treeParentRefs(tree: AnyTreeRecord): ReadonlyMap<string, ElementRef> {
	const parents = new Map<string, ElementRef>()
	const pending = [tree]
	while (pending.length > 0) {
		const node = pending.pop()
		if (!node) continue
		for (const child of node.tree) {
			parents.set(child.id, { tagName: node.tagName, id: node.id })
			pending.push(child)
		}
	}
	return parents
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
	params: WriteMovesParams,
): Promise<void> {
	for (const move of params.moves) {
		// the element and its parent are of tags the walk read: `any` takes them as they are
		await tx.any.move(toRef(move.instance), { parent: move.parent })
	}
}

/**
 * The lineages a walk can pair an instance element with: the uuids of the source subtree, but those of a boundary tag
 * another pass owns (`omit`) and of what the instance's selection of variants leaves out (`notSelected`), with what they
 * hold. An instance element below a removed one carrying one of them is moved out of it, not removed with it.
 */
export function movableSourceUuids(params: MovableSourceParams): Set<string> {
	const { omit, notSelected } = params
	const movable = new Set<string>()
	const pending = [...params.sourceTree.tree]
	while (pending.length > 0) {
		const node = pending.pop()
		if (!node || omit?.includes(node.tagName) || notSelected?.has(node.id)) continue
		const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
		if (uuid) movable.add(uuid)
		pending.push(...node.tree)
	}
	return movable
}

/** Whether an instance element below a removed one is the source's still, elsewhere: the walk pairs and moves it. */
export function movedOut(params: MovedOutParams): boolean {
	const { node, matchKey, movable } = params
	const lineage = readAttribute({ record: node, name: matchKey, defaults: 'none' })
	return lineage !== '' && movable.has(lineage)
}

/** The elements of an instance subtree a removal takes: every one, but those moved out of it and what they hold. */
export function removedElementsOf(params: MovedOutParams): AnyTreeRecord[] {
	const below = params.node.tree.filter((child) => !movedOut({ ...params, node: child }))
	return [params.node, ...below.flatMap((child) => removedElementsOf({ ...params, node: child }))]
}

/** The topmost elements below a node a predicate picks, each with what it holds left to the caller. */
export function topmostBelow(params: TopmostBelowParams): AnyTreeRecord[] {
	const { node, picks } = params
	return node.tree.flatMap((child) =>
		picks(child) ? [child] : topmostBelow({ node: child, picks }),
	)
}

/**
 * The diff's tree with what the walk reports as moved left out of every removal and every element listed as the
 * project's own: a moved element is one change, in its own group, never also taken with the parent it leaves.
 */
export function withoutMovedOut(params: WithoutMovedOutParams): DiffNode {
	const movedIds = new Set(movedInstanceIds(params.root))
	return movedIds.size === 0 ? params.root : prunedBelow({ node: params.root, movedIds })
}

function prunedBelow(params: PrunedBelowParams): DiffNode {
	const { node, movedIds } = params
	const leaves = node.change === 'removed' || node.change === 'target-only'
	const kept = leaves
		? node.children.filter((child) => !child.instanceRef?.id || !movedIds.has(child.instanceRef.id))
		: node.children
	return { ...node, children: kept.map((child) => prunedBelow({ node: child, movedIds })) }
}

/** The instance ids of the nodes a diff's tree reports as moved. */
function movedInstanceIds(node: DiffNode): string[] {
	const own = node.change === 'moved' && node.instanceRef?.id ? [node.instanceRef.id] : []
	return [...own, ...node.children.flatMap(movedInstanceIds)]
}
