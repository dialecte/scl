import { SCENARIO_POLICIES } from './scenario-policy.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { LifecycleScenario } from './contract.types'
import type { ScenarioPolicy, ScenarioPolicyParams } from './scenario-policy.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

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

/** Refuse a previous revision given to an operation that does not read one: only a fork does. */
export function assertRevisionBaseFits(params: {
	scenario: LifecycleScenario | undefined
	baseQuery: Core.Query<Config> | undefined
}): void {
	const { scenario = 'template', baseQuery } = params
	if (!baseQuery || SCENARIO_POLICIES[scenario].removalBase === 'revision') return
	throwDialecteError(SCL_ERRORS.REVISION_BASE_WITHOUT_FORK, {
		meta: { scenario },
		detail: `a previous revision is given to "${scenario}": only a fork reads one`,
	})
}
