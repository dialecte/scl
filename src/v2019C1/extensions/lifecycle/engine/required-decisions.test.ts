import { assertRequiredDecisionsTaken } from './decide'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DecisionGroup, DecisionMap } from './diff.types'
import type { SclTest } from '@/v2019C1/test'

describe('decisions leaving out a group waiting for one', () => {
	const waiting: DecisionGroup = {
		id: 'Val:ctl-t',
		change: 'modified',
		title: 'modified Val',
		primary: { change: 'modified', tagName: 'Val', children: [] },
		companions: [],
		dependsOn: [],
		suggestedAction: 'skip',
		requiresDecision: 'value-outside-enumeration',
	}
	const free: DecisionGroup = {
		id: 'Val:tmo-t',
		change: 'modified',
		title: 'modified Val',
		primary: { change: 'modified', tagName: 'Val', children: [] },
		companions: [],
		dependsOn: [],
		suggestedAction: 'accept',
	}

	type TestCase = SclTest.BaseTestCase & {
		decisions: DecisionMap
		expected: { refused?: { key: string | undefined; meta: unknown } }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the waiting group not named → refused, naming it': {
			decisions: new Map([['Val:tmo-t', 'accept']]),
			expected: {
				refused: { key: 'DECISION_REQUIRED', meta: { groupIds: ['Val:ctl-t'] } },
			},
		},
		'the waiting group skipped by name → taken': {
			decisions: new Map([['Val:ctl-t', 'skip']]),
			expected: {},
		},
	}

	async function act(testCase: TestCase): Promise<void> {
		const outcome = await Promise.resolve()
			.then(function check() {
				assertRequiredDecisionsTaken({ groups: [waiting, free], decisions: testCase.decisions })
				return {}
			})
			.catch(function refusal(error: unknown) {
				const refused = toDialecteError(error)
				return { refused: { key: refused?.key, meta: refused?.meta } }
			})
		expect(outcome).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
