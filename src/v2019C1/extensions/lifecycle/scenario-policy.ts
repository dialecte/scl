import { SCENARIO_POLICIES } from './scenario-policy.constants'

import type { ScenarioPolicy, ScenarioPolicyParams } from './scenario-policy.types'

/**
 * The policy a verb follows: the scenario's row (`template` when none is asked for). An element placed afresh by a
 * larger operation keeps the scenario's identity and naming, but is matched to no instance and brings references of
 * its own.
 */
export function scenarioPolicy(params: ScenarioPolicyParams = {}): ScenarioPolicy {
	const { scenario = 'template', placesFresh = false } = params
	const policy = SCENARIO_POLICIES[scenario]
	return placesFresh ? placedFresh(policy) : policy
}

/** The policy of an element a larger operation places afresh: matched to no instance, its references its own. */
export function placedFresh(policy: ScenarioPolicy): ScenarioPolicy {
	return { ...policy, matchesInstances: false, refsAlwaysAdded: true }
}
