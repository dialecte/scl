import { invariant } from '@dialecte/core/utils'

import type { DecisionGroup, DecisionMap, DiffNode } from './diff.types'

/**
 * The record ids reconcile is allowed to touch, derived from the accepted
 * groups. `sourceIds` gate updates/grafts (matched by the source element);
 * `instanceIds` gate deletes (matched by the instance element).
 */
export type AcceptedIds = {
	sourceIds: ReadonlySet<string>
	instanceIds: ReadonlySet<string>
}

/** A group is accepted unless explicitly skipped (absent -> suggestedAction = accept). */
function isAccepted(params: { groupId: string; decisions: DecisionMap }): boolean {
	return params.decisions.get(params.groupId) !== 'skip'
}

/**
 * Dependency guard (07 §4): reject a decision set that accepts a group whose
 * `dependsOn` parent is skipped. Runs before any write.
 */
export function assertDecisionsCoherent(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): void {
	const { groups, decisions } = params
	for (const group of groups) {
		if (!isAccepted({ groupId: group.id, decisions })) continue
		for (const parentId of group.dependsOn) {
			invariant(isAccepted({ groupId: parentId, decisions }), {
				detail: `decision accepts group "${group.id}" but its dependency "${parentId}" is skipped`,
			})
		}
	}
}

/**
 * Collect the record ids reconcile may write, from every accepted group's
 * primary + companions. Added/modified nodes contribute their `sourceRef`
 * (reconcile matches/grafts by source); removed nodes contribute `instanceRef`.
 */
export function acceptedRefIds(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): AcceptedIds {
	const { groups, decisions } = params
	const sourceIds = new Set<string>()
	const instanceIds = new Set<string>()

	for (const group of groups) {
		if (!isAccepted({ groupId: group.id, decisions })) continue
		for (const node of [group.primary, ...group.companions]) {
			collectNodeId({ node, sourceIds, instanceIds })
		}
	}

	return { sourceIds, instanceIds }
}

function collectNodeId(params: {
	node: DiffNode
	sourceIds: Set<string>
	instanceIds: Set<string>
}): void {
	const { node, sourceIds, instanceIds } = params
	if (node.change === 'removed') {
		if (node.instanceRef) instanceIds.add(node.instanceRef.id)
	} else if (node.sourceRef) {
		sourceIds.add(node.sourceRef.id)
	}
}
