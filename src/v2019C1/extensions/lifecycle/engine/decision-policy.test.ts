import { assertDecisionPolicyKept, withDecisionPolicy } from './decision-policy'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DecisionPolicy } from './decision-policy.types'
import type { DecisionGroup, DecisionMap, DiffReport } from './diff.types'
import type { SclTest } from '@/v2019C1/test'

/** A value the template changes, nothing keeping it from its suggested action. */
const free: DecisionGroup = {
	id: 'Val:tmo-t',
	change: 'modified',
	title: 'modified Val',
	primary: { change: 'modified', tagName: 'Val', children: [] },
	companions: [],
	dependsOn: [],
	suggestedAction: 'accept',
}

/** A value the template changes outside what its type now allows: it waits for a decision of its own. */
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

/** A first placement's report: on the fast track, its groups taking their suggested actions. */
const firstPlacement: DiffReport = {
	instances: [
		{
			title: 'Prot',
			linked: false,
			upToDate: false,
			tree: { change: 'added', tagName: 'Function', children: [] },
			groups: [free, waiting],
			mappings: [],
		},
	],
	needsDecisions: false,
	summary: { added: 1, removed: 0, modified: 0, moved: 0, kept: 0 },
	mappings: [],
	templateInstances: [],
}

describe('the report under a decision policy', () => {
	type TestCase = SclTest.BaseTestCase & {
		decisionPolicy?: DecisionPolicy
		expected: Pick<DiffReport, 'decisionPolicy' | 'needsDecisions'> & { groups: DecisionGroup[] }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'no policy → the groups as made, the fast track kept, the default recorded': {
			expected: { decisionPolicy: 'default', needsDecisions: false, groups: [free, waiting] },
		},
		'every-change → the free group waits with no default, the waiting one keeps its reason, decisions needed':
			{
				decisionPolicy: 'every-change',
				expected: {
					decisionPolicy: 'every-change',
					needsDecisions: true,
					groups: [{ ...free, suggestedAction: 'skip', requiresDecision: 'no-default' }, waiting],
				},
			},
	}

	function act(testCase: TestCase): void {
		const report = withDecisionPolicy({
			report: firstPlacement,
			decisionPolicy: testCase.decisionPolicy,
		})
		const { decisionPolicy, needsDecisions } = report
		const groups = report.instances.flatMap((instance) => instance.groups)
		expect({ decisionPolicy, needsDecisions, groups }).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})

describe("decisions under the report's decision policy", () => {
	type TestCase = SclTest.BaseTestCase & {
		decisionPolicy: DecisionPolicy
		decisions: DecisionMap
		expected: { refused?: { key: string | undefined; meta: unknown } }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'every-change, a group left out → refused, naming it': {
			decisionPolicy: 'every-change',
			decisions: new Map([['Val:ctl-t', 'skip']]),
			expected: { refused: { key: 'DECISION_REQUIRED', meta: { groupIds: ['Val:tmo-t'] } } },
		},
		'every-change, every group named → taken': {
			decisionPolicy: 'every-change',
			decisions: new Map([
				['Val:tmo-t', 'accept'],
				['Val:ctl-t', 'skip'],
			]),
			expected: {},
		},
	}

	async function act(testCase: TestCase): Promise<void> {
		const report = { ...firstPlacement, decisionPolicy: testCase.decisionPolicy }
		const outcome = await Promise.resolve()
			.then(function check() {
				assertDecisionPolicyKept({ report, groups: [free, waiting], decisions: testCase.decisions })
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
