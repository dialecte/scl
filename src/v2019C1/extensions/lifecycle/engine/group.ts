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
export function groupChanges(root: DiffNode, instanceScopeId?: string): DecisionGroup[] {
	const groups: DecisionGroup[] = []
	collectGroups({ node: root, instanceScopeId, out: groups })
	return groups
}

function collectGroups(params: {
	node: DiffNode
	instanceScopeId: string | undefined
	out: DecisionGroup[]
}): void {
	const { node, instanceScopeId, out } = params
	if (node.change === 'unchanged') {
		for (const child of node.children) collectGroups({ node: child, instanceScopeId, out })
		return
	}

	// node is a topmost changed node -> a group root; its changed descendants
	// become companions (we do NOT recurse into groups here).
	const companions: DiffNode[] = []
	collectChangedDescendants({ node, out: companions })

	out.push({
		id: groupId(node, instanceScopeId),
		change: node.change,
		title: `${node.change} ${node.tagName}`,
		primary: node,
		companions,
		dependsOn: [],
		suggestedAction: 'accept',
		instanceScopeId,
	})
}

function collectChangedDescendants(params: { node: DiffNode; out: DiffNode[] }): void {
	const { node, out } = params
	for (const child of node.children) {
		if (child.change !== 'unchanged') out.push(child)
		collectChangedDescendants({ node: child, out })
	}
}

/** Stable, unique key for the primary — the ref that exists for its change kind. */
function groupId(node: DiffNode, instanceScopeId: string | undefined): string {
	const ref = node.sourceRef ?? node.instanceRef
	const base = ref ? `${ref.tagName}:${ref.id}` : node.tagName
	// scope by the instance root so the SAME template element in two instances yields
	// two distinct group ids (multi-instance targeting)
	return instanceScopeId ? `${instanceScopeId}::${base}` : base
}
