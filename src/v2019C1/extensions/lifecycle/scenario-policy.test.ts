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
			namesFollow: 'project',
			subNetworkSettings: 'source',
			placement: 'template-levels',
			composedFunctions: 'missing',
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
			namesFollow: 'project',
			subNetworkSettings: 'project',
			placement: 'template-levels',
			composedFunctions: 'missing',
		},
	},
	'fork: the previous revision matched by the uuids both share, kept, on what it places too, its names followed':
		{
			params: { scenario: 'fork' },
			expected: {
				matchKey: 'uuid',
				matchesInstances: true,
				refsAlwaysAdded: false,
				identityMode: 'keep',
				bumpsCollisions: true,
				placementIdentity: 'keep',
				writesProvenance: false,
				removalBase: 'revision',
				namesFollow: 'source',
				subNetworkSettings: 'source',
				placement: 'template-levels',
				composedFunctions: 'missing',
			},
		},
	'copy: inside one document, fresh uuids and the lineage as copied, landed by the levels its content sits on, every function it composes, no policy of its own for the references leaving it':
		{
			params: { scenario: 'copy' },
			expected: {
				matchKey: 'uuid',
				matchesInstances: false,
				refsAlwaysAdded: true,
				identityMode: 'keep',
				bumpsCollisions: true,
				placementIdentity: 'copy',
				writesProvenance: false,
				removalBase: 'none',
				namesFollow: 'project',
				subNetworkSettings: 'source',
				placement: 'source-levels',
				composedFunctions: 'all',
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
				bumpsCollisions: true,
				placementIdentity: 'keep',
				writesProvenance: false,
				removalBase: 'revision',
				namesFollow: 'source',
				subNetworkSettings: 'source',
				placement: 'template-levels',
				composedFunctions: 'missing',
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

	it('the copy row places with its own identity: lineage as copied, never the source uuids', () => {
		expectTypeOf<(typeof SCENARIO_POLICIES)['copy']['placementIdentity']>().toEqualTypeOf<'copy'>()
		expectTypeOf<(typeof SCENARIO_POLICIES)['copy']['identityMode']>().toEqualTypeOf<'keep'>()
		const row = (SCENARIO_POLICIES as Partial<Record<string, ScenarioPolicy>>)['copy']
		expect({ placementIdentity: row?.placementIdentity, identityMode: row?.identityMode }).toEqual({
			placementIdentity: 'copy',
			identityMode: 'keep',
		})
	})

	it('has one row per scenario, no more', () => {
		expectTypeOf<keyof typeof SCENARIO_POLICIES>().toEqualTypeOf<LifecycleScenario>()
		expect(Object.keys(SCENARIO_POLICIES).sort()).toEqual([
			'copy',
			'fork',
			'instantiate',
			'template',
		])
	})
})
