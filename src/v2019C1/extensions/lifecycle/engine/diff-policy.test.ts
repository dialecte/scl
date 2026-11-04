import { readDiffPolicy } from './diff-policy'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DiffPolicy } from './diff-policy.types'
import type { Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'

describe('readDiffPolicy', () => {
	type TestCase = {
		only?: boolean
		resolution?: Resolution
		expected: DiffPolicy
	}

	const testCases: Record<string, TestCase> = {
		"no resolution → bound logical nodes follow the template, no tag is the consumer's": {
			expected: { boundLogicalNodeTypes: 'follow', consumerManagedTags: new Set() },
		},
		'a resolution naming neither option → the same defaults': {
			resolution: { sharedFunctions: 'merge' },
			expected: { boundLogicalNodeTypes: 'follow', consumerManagedTags: new Set() },
		},
		"boundLogicalNodeTypes keep → carried, no tag is the consumer's": {
			resolution: { boundLogicalNodeTypes: 'keep' },
			expected: { boundLogicalNodeTypes: 'keep', consumerManagedTags: new Set() },
		},
		'consumerManagedTags → the set of the tags, bound logical nodes follow': {
			resolution: { consumerManagedTags: ['FunctionRole', 'FunctionRoleContent'] },
			expected: {
				boundLogicalNodeTypes: 'follow',
				consumerManagedTags: new Set(['FunctionRole', 'FunctionRoleContent']),
			},
		},
	}

	function act(testCase: TestCase): void {
		expect(readDiffPolicy({ resolution: testCase.resolution })).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
