import { groupChanges } from './group'

import { toRef } from '@dialecte/core/helpers'

import { readAttribute } from '@/v2019C1/helpers'

import type { DeletedDataReferrer } from './deleted-data-referrers.types'
import type { AttributeChange, DecisionGroup, DiffNode } from './diff.types'

/**
 * The decision groups of an instance's diff with the references to the data it deletes, each waiting for a decision
 * of its own (`requiresDecision: 'names-deleted-data'`), a group of its own even below an element the project added: a
 * reference the diff lists as the project's own is that node (an input kept listed `modified`, its source attributes
 * going); any other is an item of its own — an entry `removed`, an input `modified` or, holding no internal address,
 * `removed`. The group deleting the data (removing a logical node, a device, a control block, or changing
 * a logical node's type) depends on each, so it cannot be accepted while one is skipped. Returns the tree, the
 * references marked, the groups, and the items outside the tree (counted in the summary).
 */
export function groupDeletedDataReferrers(params: {
	root: DiffNode
	scopePrefix: string
	referrers: readonly DeletedDataReferrer[]
}): { root: DiffNode; groups: DecisionGroup[]; items: DiffNode[] } {
	const { scopePrefix, referrers } = params
	const itemsById = new Map(referrers.map((item) => [item.referrer.id, item]))
	const root = withRequiredDecisions({ node: params.root, itemsById })
	const inTree = new Set(markedIds(root))
	const items = referrers
		.filter((item) => !inTree.has(item.referrer.id))
		.map((item) => itemNode(item))
	const groups = [
		...groupChanges(root, scopePrefix),
		...items.flatMap((node) => groupChanges(node, scopePrefix)),
	]
	return { root, groups: withDependencies({ groups, referrers }), items }
}

/**
 * The tree with each reference of the project's own (`target-only`) among the referrers marked as waiting: an entry, or
 * an input going, as it is (accepted, it goes); an input kept, its source cleared, as the item its decision writes
 * (`modified`, the attributes going listed).
 */
function withRequiredDecisions(params: {
	node: DiffNode
	itemsById: ReadonlyMap<string, DeletedDataReferrer>
}): DiffNode {
	const { node, itemsById } = params
	const children = node.children.map((child) => withRequiredDecisions({ node: child, itemsById }))
	const item =
		node.change === 'target-only' && node.instanceRef?.id
			? itemsById.get(node.instanceRef.id)
			: undefined
	if (!item) return { ...node, children }
	if (item.effect.effect === 'cleared') return { ...itemNode(item), children }
	return { ...node, children, requiresDecision: 'names-deleted-data' }
}

/** The project elements of the nodes marked as waiting for their deleted data. */
function markedIds(node: DiffNode): string[] {
	const own =
		node.requiresDecision === 'names-deleted-data' && node.instanceRef?.id
			? [node.instanceRef.id]
			: []
	return [...own, ...node.children.flatMap(markedIds)]
}

/** A reference outside the instance's tree as an item: one going `removed`, an input with its source attributes going. */
function itemNode(item: DeletedDataReferrer): DiffNode {
	const { referrer, effect } = item
	const base = {
		tagName: referrer.tagName,
		instanceRef: toRef(referrer),
		requiresDecision: 'names-deleted-data' as const,
		children: [],
	}
	if (effect.effect === 'deleted') return { ...base, change: 'removed' }
	const attributeChanges = effect.attributes.flatMap((name): AttributeChange[] => {
		const before = readAttribute({ record: referrer, name, defaults: 'none' })
		return before ? [{ name, before }] : []
	})
	return { ...base, change: 'modified', attributeChanges }
}

/** The project elements of a node and of everything below it. */
function heldIds(node: DiffNode): string[] {
	return [...(node.instanceRef?.id ? [node.instanceRef.id] : []), ...node.children.flatMap(heldIds)]
}

/**
 * The groups, each deleting data made to depend on the groups of the references to it, and each removing an element
 * the project added (`target-only`: accepted, it goes with what it holds) that holds such a reference on that
 * reference's group; a change of the element in place takes nothing it holds.
 */
function withDependencies(params: {
	groups: readonly DecisionGroup[]
	referrers: readonly DeletedDataReferrer[]
}): DecisionGroup[] {
	const { groups, referrers } = params
	const groupOfElement = new Map(
		groups.flatMap((group) =>
			[group.primary, ...group.companions].flatMap((node): [string, string][] =>
				node.instanceRef?.id ? [[node.instanceRef.id, group.id]] : [],
			),
		),
	)
	const itemGroupIds = new Map(
		groups.flatMap((group): [string, string][] =>
			group.requiresDecision === 'names-deleted-data' && group.primary.instanceRef?.id
				? [[group.primary.instanceRef.id, group.id]]
				: [],
		),
	)
	const needed = new Map<string, string[]>()
	// a group removing an element the project added that holds a reference waiting takes it: it needs its decision
	for (const group of groups) {
		if (group.change !== 'target-only') continue
		const held = group.primary.children.flatMap(heldIds).flatMap((id) => {
			const itemGroup = itemGroupIds.get(id)
			return itemGroup && itemGroup !== group.id ? [itemGroup] : []
		})
		if (held.length > 0) needed.set(group.id, [...(needed.get(group.id) ?? []), ...held])
	}
	for (const { referrer, deletedBy } of referrers) {
		const deletingGroup = groupOfElement.get(deletedBy)
		// a reference waiting is a group of its own; one taken by another group still binds that group
		const itemGroup = itemGroupIds.get(referrer.id) ?? groupOfElement.get(referrer.id)
		if (deletingGroup && itemGroup)
			needed.set(deletingGroup, [...(needed.get(deletingGroup) ?? []), itemGroup])
	}
	return groups.map((group) =>
		needed.has(group.id)
			? { ...group, dependsOn: [...new Set([...group.dependsOn, ...(needed.get(group.id) ?? [])])] }
			: group,
	)
}
