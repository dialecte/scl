import { presentationScope } from './presentation-scope'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { PresentationScope } from './presentation-scope.types'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseTestCase & {
	verb: LifecycleTarget['verb']
	expected: PresentationScope
}

describe('presentationScope', () => {
	const testCases: Record<string, TestCase> = {
		'an IED → rooted at SCL, nothing omitted or added beside it': {
			verb: 'ied',
			expected: { rootTag: 'SCL', omit: [], include: [] },
		},
	}

	function act(testCase: TestCase) {
		expect(presentationScope({ verb: testCase.verb })).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
