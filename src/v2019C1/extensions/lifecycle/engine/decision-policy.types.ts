import type { DECISION_POLICY_RULES } from './decision-policy.constants'
import type { DecisionGroup, DecisionMap } from './diff.types'

/**
 * How the changes of a report are decided (`query.lifecycle.report`'s `decisionPolicy`, recorded on the report):
 * - `default`: a change takes its suggested action unless it waits for a decision of its own (`requiresDecision`);
 * - `every-change`: no change takes a default: every group waits for an explicit decision (`requiresDecision:
 *   'no-default'`), and `apply` refuses decisions leaving one out.
 */
export type DecisionPolicy = keyof typeof DECISION_POLICY_RULES

/**
 * What a decision policy changes, each hook absent when it changes nothing: how the report marks each group, whether
 * its groups need a decision on their own (the report's track otherwise), and what `apply` refuses of the decisions
 * beyond what every policy refuses. `apply` reads the policy the report records, not the marks: a report whose marks
 * were dropped on the way is refused all the same.
 */
export type DecisionPolicyRule = {
	markGroup?: (params: { group: DecisionGroup }) => DecisionGroup
	needsDecisions?: (params: { groups: readonly DecisionGroup[] }) => boolean
	assertDecisions?: (params: { groups: readonly DecisionGroup[]; decisions: DecisionMap }) => void
}
