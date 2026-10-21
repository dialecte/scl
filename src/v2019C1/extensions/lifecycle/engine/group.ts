import { toRef } from '@dialecte/core/helpers'

import type { DecisionGroup, DiffNode, ReportInstance } from './diff.types'
import type { DroppedElement } from './removal-base.types'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Group stage: fold the `DiffNode` change tree into
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
export function groupChanges(root: DiffNode, scopePrefix?: string): DecisionGroup[] {
	const groups: DecisionGroup[] = []
	collectGroups({ node: root, scopePrefix, out: groups })
	return groups
}

function collectGroups(params: {
	node: DiffNode
	scopePrefix: string | undefined
	out: DecisionGroup[]
}): void {
	const { node, scopePrefix, out } = params
	if (node.change === 'unchanged') {
		for (const child of node.children) collectGroups({ node: child, scopePrefix, out })
		return
	}

	// node is a topmost changed node -> a group root; its changed descendants
	// become companions (we do NOT recurse into groups here) — but what the project added below a
	// change of the template is its own decision, kept by default: accepting the change never takes it
	const companions: DiffNode[] = []
	const apart: DiffNode[] = []
	collectChangedDescendants({
		node,
		out: companions,
		apart: node.change === 'target-only' ? undefined : apart,
	})

	out.push({
		id: groupId(node, scopePrefix),
		change: node.change,
		title: `${node.change} ${node.tagName}`,
		primary: node,
		companions,
		dependsOn: [],
		// A target-only (author-added) element defaults to KEEP: skip unless the user
		// explicitly opts into removing it. Everything else defaults to accept.
		suggestedAction: node.change === 'target-only' ? 'skip' : 'accept',
	})
	for (const own of apart) collectGroups({ node: own, scopePrefix, out })
}

/**
 * The changed descendants of a node, in `out`. With `apart`, an element the project added (`target-only`) is set
 * there instead, with what it holds: a group of its own.
 */
export function collectChangedDescendants(params: {
	node: DiffNode
	out: DiffNode[]
	apart?: DiffNode[]
}): void {
	const { node, out, apart } = params
	for (const child of node.children) {
		if (apart && child.change === 'target-only') {
			apart.push(child)
			continue
		}
		if (child.change !== 'unchanged') out.push(child)
		collectChangedDescendants({ node: child, out, apart })
	}
}

/**
 * Make a first-placement report instance one made for an element of the project: it says which, and
 * its groups are scoped to it — the same template element placed twice yields two groups, decided
 * apart.
 */
export function placeFor(params: { instance: ReportInstance; placedFor: AnyRefOrRecord }): void {
	const { instance, placedFor } = params
	const scopePrefix = placedFor.id
	if (!scopePrefix) return
	instance.placedFor = placedFor
	for (const group of instance.groups) {
		group.id = scopedId({ id: group.id, scopePrefix })
		group.dependsOn = group.dependsOn.map((dependency) => scopedId({ id: dependency, scopePrefix }))
	}
}

/** Stable, unique key for the primary — the ref that exists for its change kind. */
function groupId(node: DiffNode, scopePrefix: string | undefined): string {
	const ref = node.sourceRef ?? node.instanceRef
	const base = ref ? `${ref.tagName}:${ref.id}` : node.tagName
	// scope by the instance root so the SAME template element in two instances yields
	// two distinct group ids (multi-instance targeting)
	return scopePrefix ? scopedId({ id: base, scopePrefix }) : base
}

export function scopedId(params: { id: string; scopePrefix: string }): string {
	return `${params.scopePrefix}::${params.id}`
}

/**
 * List the elements an instance holds that the source no longer does (dropped, or the project's own) in that
 * instance's report: each in its tree, and as a group of its own scoped to the instance — a removal suggested, the
 * project's own kept unless accepted. Returns the groups added.
 */
export function addDroppedGroups(params: {
	reportInstance: ReportInstance
	dropped: readonly DroppedElement[]
}): DecisionGroup[] {
	const { reportInstance, dropped } = params
	const added: DecisionGroup[] = []
	for (const { element, change } of dropped) {
		const node: DiffNode = {
			change,
			tagName: element.tagName,
			instanceRef: toRef(element),
			children: [],
		}
		reportInstance.tree.children.push(node)
		added.push(...groupChanges(node, reportInstance.rootRef?.id))
	}
	reportInstance.groups.push(...added)
	if (added.length > 0) reportInstance.upToDate = false
	return added
}
