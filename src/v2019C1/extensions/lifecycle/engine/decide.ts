import { invariant } from '@dialecte/core/utils'

import type { AcceptedIds, CollisionOverrides } from './decide.types'
import type { DecisionGroup, DecisionMap, DiffNode, DiffReport, GroupDecision } from './diff.types'

/** The decision groups scoped to one instance root (empty when the instance is absent/up-to-date). */
export function groupsForInstance(
	report: DiffReport | undefined,
	instanceId: string,
): DecisionGroup[] {
	return report?.instances.find((instance) => instance.rootRef?.id === instanceId)?.groups ?? []
}

/** The action of a decision (absent -> accept; string or object form). */
export function decisionAction(decision: GroupDecision | undefined): 'accept' | 'skip' {
	if (decision === undefined) return 'accept'
	if (typeof decision === 'string') return decision
	return decision.action
}

/** The user-edited values carried by a decision, if any. */
function decisionValues(decision: GroupDecision | undefined): Record<string, string> | undefined {
	return typeof decision === 'object' ? decision.values : undefined
}

/** The resolved action for a group: an explicit decision, else its `suggestedAction`. */
function resolvedAction(params: {
	group: DecisionGroup
	decisions: DecisionMap
}): 'accept' | 'skip' {
	const decision = params.decisions.get(params.group.id)
	if (decision === undefined) return params.group.suggestedAction
	return decisionAction(decision)
}

/** A group is accepted when its resolved action is not `skip`. */
function isAccepted(params: { group: DecisionGroup; decisions: DecisionMap }): boolean {
	return resolvedAction(params) !== 'skip'
}

/**
 * The user-edited values for each accepted group, keyed by the primary's SOURCE id
 * (the placed element is matched by its source at instantiate time). Skipped groups
 * and groups with no edits are omitted.
 */
export function collisionOverrides(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): CollisionOverrides {
	const { groups, decisions } = params
	const out = new Map<string, Record<string, string>>()
	for (const group of groups) {
		const decision = decisions.get(group.id)
		if (resolvedAction({ group, decisions }) === 'skip') continue
		const values = decisionValues(decision)
		const sourceId = group.primary.sourceRef?.id
		if (values && sourceId) out.set(sourceId, values)
	}
	return out
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
		if (!isAccepted({ group, decisions })) continue
		for (const parentId of group.dependsOn) {
			invariant(isAccepted({ group: groupById(groups, parentId) ?? group, decisions }), {
				detail: `decision accepts group "${group.id}" but its dependency "${parentId}" is skipped`,
			})
		}
	}
}

function groupById(groups: DecisionGroup[], id: string): DecisionGroup | undefined {
	return groups.find((group) => group.id === id)
}

/**
 * Collect the record ids reconcile may write, from every accepted group's
 * primary + companions. Added/modified nodes contribute their `sourceRef`
 * (reconcile matches/adds by source); removed nodes contribute `instanceRef`.
 */
export function acceptedRefIds(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): AcceptedIds {
	const { groups, decisions } = params
	const sourceIds = new Set<string>()
	const instanceIds = new Set<string>()

	for (const group of groups) {
		if (!isAccepted({ group, decisions })) continue
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
	if (node.change === 'removed' || node.change === 'target-only') {
		if (node.instanceRef?.id) instanceIds.add(node.instanceRef.id)
	} else if (node.sourceRef?.id) {
		sourceIds.add(node.sourceRef.id)
	}
}
