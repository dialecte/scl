import type { DecisionGroup, DiffNode } from './diff.types'

/**
 * Group stage (ENGINE.md §8, 07 §3.1): fold the `DiffNode` change tree into
 * accept/skip decision units.
 *
 * v1 rule (structural): each **topmost** changed node (its ancestors are all
 * unchanged) becomes a group `primary`; every changed node beneath it becomes a
 * `companion` that travels with it (untoggleable). Separate top-level changed
 * regions become separate groups.
 *
 * Deliberately deferred (follow-ups, kept out of the frozen shape's meaning):
 * reference-linked companions (satellites via the ownership map + ref pairs),
 * and `dependsOn` edges for nested-independent changes — both currently empty.
 */
export function groupChanges(root: DiffNode): DecisionGroup[] {
	const groups: DecisionGroup[] = []
	collectGroups(root, groups)
	return groups
}

function collectGroups(node: DiffNode, out: DecisionGroup[]): void {
	if (node.change === 'unchanged') {
		for (const child of node.children) collectGroups(child, out)
		return
	}

	// node is a topmost changed node -> a group root; its changed descendants
	// become companions (we do NOT recurse into groups here).
	const companions: DiffNode[] = []
	collectChangedDescendants(node, companions)

	out.push({
		id: groupId(node),
		change: node.change,
		title: `${node.change} ${node.tagName}`,
		primary: node,
		companions,
		dependsOn: [],
		suggestedAction: 'accept',
	})
}

function collectChangedDescendants(node: DiffNode, out: DiffNode[]): void {
	for (const child of node.children) {
		if (child.change !== 'unchanged') out.push(child)
		collectChangedDescendants(child, out)
	}
}

/** Stable, unique key for the primary — the ref that exists for its change kind. */
function groupId(node: DiffNode): string {
	const ref = node.sourceRef ?? node.instanceRef
	return ref ? `${ref.tagName}:${ref.id}` : node.tagName
}
