import { scenarioPolicy } from './scenario-policy'
import { SCENARIO_POLICIES } from './scenario-policy.constants'

import { describe, expect, expectTypeOf, it } from 'vitest'

import type { LifecycleScenario } from './contract.types'
import type { ScenarioPolicy, ScenarioPolicyParams } from './scenario-policy.types'

type TestCase = { params: ScenarioPolicyParams; expected: ScenarioPolicy }

const testCases: Record<string, TestCase> = {
	'instantiate: a new instance, its lineage stamped, its references its own': {
		params: { scenario: 'instantiate' },
		expected: {
			matchKey: 'templateUuid',
			matchesInstances: false,
			refsAlwaysAdded: true,
			identityMode: 'stamp-template',
			bumpsCollisions: true,
			placementIdentity: 'stamp-template',
			writesProvenance: true,
			removalBase: 'none',
		},
	},
	'template: the instances matched by their lineage': {
		params: { scenario: 'template' },
		expected: {
			matchKey: 'templateUuid',
			matchesInstances: true,
			refsAlwaysAdded: false,
			identityMode: 'stamp-template',
			bumpsCollisions: true,
			placementIdentity: 'stamp-template',
			writesProvenance: true,
			removalBase: 'lineage',
		},
	},
	'fork: the previous revision matched by the uuids both share, kept, on what it places too': {
		params: { scenario: 'fork' },
		expected: {
			matchKey: 'uuid',
			matchesInstances: true,
			refsAlwaysAdded: false,
			identityMode: 'keep',
			bumpsCollisions: false,
			placementIdentity: 'keep',
			writesProvenance: false,
			removalBase: 'revision',
		},
	},
	'no scenario asked: template': {
		params: {},
		expected: SCENARIO_POLICIES.template,
	},
	'placed afresh within a fork: the fork identity, matched to no instance, its references its own':
		{
			params: { scenario: 'fork', placesFresh: true },
			expected: {
				matchKey: 'uuid',
				matchesInstances: false,
				refsAlwaysAdded: true,
				identityMode: 'keep',
				bumpsCollisions: false,
				placementIdentity: 'keep',
				writesProvenance: false,
				removalBase: 'revision',
			},
		},
	'placed afresh within a template update: the template identity, matched to no instance, its references its own':
		{
			params: { scenario: 'template', placesFresh: true },
			expected: { ...SCENARIO_POLICIES.template, matchesInstances: false, refsAlwaysAdded: true },
		},
}

describe('scenarioPolicy', () => {
	it.each(Object.entries(testCases))('%s', (_name, { params, expected }) => {
		expect(scenarioPolicy(params)).toEqual(expected)
	})

	it('has one row per scenario, no more', () => {
		expectTypeOf<keyof typeof SCENARIO_POLICIES>().toEqualTypeOf<LifecycleScenario>()
		expect(Object.keys(SCENARIO_POLICIES).sort()).toEqual(['fork', 'instantiate', 'template'])
	})
})
