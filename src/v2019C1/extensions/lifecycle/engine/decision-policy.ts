import { DECISION_POLICY_RULES, DEFAULT_DECISION_POLICY } from './decision-policy.constants'

import type { DecisionPolicy, DecisionPolicyRule } from './decision-policy.types'
import type { DecisionGroup, DecisionMap, DiffReport } from './diff.types'

/**
 * The report under a decision policy: each group marked as the policy says, the policy recorded, and the track the
 * full one when the policy says its groups need a decision.
 */
export function withDecisionPolicy(params: {
	report: DiffReport
	decisionPolicy: DecisionPolicy | undefined
}): DiffReport {
	const { report } = params
	const decisionPolicy = params.decisionPolicy ?? DEFAULT_DECISION_POLICY
	const rule: DecisionPolicyRule = DECISION_POLICY_RULES[decisionPolicy]
	const { markGroup } = rule
	const instances = markGroup
		? report.instances.map(function markInstance(instance) {
				return { ...instance, groups: instance.groups.map((group) => markGroup({ group })) }
			})
		: report.instances
	const groups = instances.flatMap((instance) => instance.groups)
	const needsDecisions = report.needsDecisions || (rule.needsDecisions?.({ groups }) ?? false)
	return { ...report, instances, decisionPolicy, needsDecisions }
}

/** Refuse, before any write, decisions the report's decision policy does not take (none recorded: the default). */
export function assertDecisionPolicyKept(params: {
	report: DiffReport
	groups: readonly DecisionGroup[]
	decisions: DecisionMap
}): void {
	const { report, groups, decisions } = params
	const decisionPolicy = report.decisionPolicy ?? DEFAULT_DECISION_POLICY
	const rule: DecisionPolicyRule = DECISION_POLICY_RULES[decisionPolicy]
	rule.assertDecisions?.({ groups, decisions })
}
