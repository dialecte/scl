import type {
	GroupParams,
	MarkOtherIedBindingsParams,
	NodeParams,
} from './mark-other-ied-bindings.types'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/**
 * A removal (`removed`, or a `target-only` element whose removal is offered) of an IED's specification deleting an
 * LNode specified on it that the project bound to another IED waits for a decision (`requiresDecision:
 * 'unbinds-another-ied'`, suggested `skip`): the binding is the project's, the update does not take it away unasked.
 * The removal is read from the whole group (its primary, what it holds, its companions): an LNode removed inside a
 * bay's group counts as its own. Told from the specification as read once (`resolveSpecificationInstance`).
 */
export function markOtherIedBindings(params: MarkOtherIedBindingsParams): void {
	for (const group of params.groups) {
		const unbinds = removedNodes({ group }).some(
			(node) => node.instanceRef?.id !== undefined && params.unbinding.has(node.instanceRef.id),
		)
		if (!unbinds) continue
		group.requiresDecision = 'unbinds-another-ied'
		group.suggestedAction = 'skip'
	}
}

/**
 * What a group removes: its nodes `removed`, or `target-only` (their removal offered), primary and companions; a node
 * below them decided in a group of its own (`target-only`, or waiting for a decision) is that group's, not this one's.
 */
function removedNodes(params: GroupParams): DiffNode[] {
	const { group } = params
	return [group.primary, ...group.companions].flatMap((node) => removedIn({ node }))
}

/** The removed nodes of a node and of what it holds, not descending into a node decided apart. */
function removedIn(params: NodeParams): DiffNode[] {
	const { node } = params
	const own = node.change === 'removed' || node.change === 'target-only' ? [node] : []
	const held = node.children
		.filter((child) => child.change !== 'target-only' && !child.requiresDecision)
		.flatMap((child) => removedIn({ node: child }))
	return [...own, ...held]
}
