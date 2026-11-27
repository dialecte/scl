import { assertEveryGroupDecided, hasAnyGroup, waitForDecision } from './decision-policy-rows'

import type { DecisionPolicyRule } from './decision-policy.types'

/** Every decision policy a report offers, with what it changes: a policy is one row (see `DecisionPolicy`). */
export const DECISION_POLICY_RULES = {
	default: {},
	'every-change': {
		markGroup: waitForDecision,
		needsDecisions: hasAnyGroup,
		assertDecisions: assertEveryGroupDecided,
	},
} as const satisfies Record<string, DecisionPolicyRule>

/** The policy of a report made without one. */
export const DEFAULT_DECISION_POLICY = 'default' satisfies keyof typeof DECISION_POLICY_RULES
