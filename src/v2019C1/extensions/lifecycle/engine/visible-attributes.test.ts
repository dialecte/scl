import { visibleAttributes } from './visible-attributes'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

describe('visibleAttributes', () => {
	type TestCase = {
		only?: boolean
		tagName: string
		attributes: Record<string, string>
		expected: Record<string, string>
	}

	const testCases: Record<string, TestCase> = {
		'Terminal → its node path, uuid and level names left out, its own attributes kept': {
			tagName: 'Terminal',
			attributes: {
				name: 'T1',
				desc: 'feeder side',
				connectivityNode: 'TEMPLATE/TEMPLATE/B1/L1',
				processName: 'P1',
				lineName: 'LN1',
				substationName: 'TEMPLATE',
				voltageLevelName: 'TEMPLATE',
				bayName: 'B1',
				cNodeName: 'L1',
				cNodeUuid: '00000000-0000-4000-8000-000000000001',
			},
			expected: { desc: 'feeder side' },
		},
		'ConnectivityNode → its pathName and identity left out': {
			tagName: 'ConnectivityNode',
			attributes: {
				name: 'L1',
				desc: 'line side',
				pathName: 'TEMPLATE/TEMPLATE/B1/L1',
				uuid: '00000000-0000-4000-8000-000000000001',
			},
			expected: { desc: 'line side' },
		},
		'an element writing nothing from a path → only identity, name and references left out': {
			tagName: 'Bay',
			attributes: { name: 'B1', desc: 'feeder', uuid: '00000000-0000-4000-8000-000000000003' },
			expected: { desc: 'feeder' },
		},
	}

	function act(testCase: TestCase): void {
		const visible = visibleAttributes({
			tagName: testCase.tagName,
			attributes: testCase.attributes,
		})
		expect(visible).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
