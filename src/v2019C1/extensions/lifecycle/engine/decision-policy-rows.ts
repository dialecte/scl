import { assertRequiredDecisionsTaken } from './decide'

import type { DecisionGroup, DecisionMap } from './diff.types'

/** `every-change`: the group waits for an explicit decision; one already waiting keeps its own reason. */
export function waitForDecision(params: { group: DecisionGroup }): DecisionGroup {
	const { group } = params
	return {
		...group,
		suggestedAction: 'skip',
		requiresDecision: group.requiresDecision ?? 'no-default',
	}
}

/** `every-change`: a report listing any change needs a decision, a first placement included. */
export function hasAnyGroup(params: { groups: readonly DecisionGroup[] }): boolean {
	return params.groups.length > 0
}

/** `every-change`: refuse decisions that do not name every group, each waiting as the policy marks it. */
export function assertEveryGroupDecided(params: {
	groups: readonly DecisionGroup[]
	decisions: DecisionMap
}): void {
	const groups = params.groups.map((group) => waitForDecision({ group }))
	assertRequiredDecisionsTaken({ groups, decisions: params.decisions })
}
