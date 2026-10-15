import { REF_ENTRIES_BY_TARGET } from './derived'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { RefEntry } from './types'

describe('derived reference views', () => {
	describe('REF_ENTRIES_BY_TARGET', () => {
		type TestCase = {
			only?: boolean
			tagName: string
			expected: {
				length: number
				refTagNames: string[]
			}
		}

		const testCases: Record<string, TestCase> = {
			'Function → direct refs (FunctionCatRef, FunctionRef, Resource) + VariableApplyTo': {
				tagName: 'Function',
				expected: {
					length: 4,
					refTagNames: ['FunctionCatRef', 'FunctionRef', 'Resource', 'VariableApplyTo'],
				},
			},
			'LNode → lnode + behavior-description + direct refs + VariableApplyTo': {
				tagName: 'LNode',
				expected: {
					length: 8,
					refTagNames: [
						'ControlRef',
						'LNodeDataRef',
						'ProcessEcho',
						'Resource',
						'SourceRef',
						'InputVar',
						'OutputVar',
						'VariableApplyTo',
					],
				},
			},
			'ExtRef → ied-address refs (SourceRef) + VariableApplyTo': {
				tagName: 'ExtRef',
				expected: {
					length: 2,
					refTagNames: ['SourceRef', 'VariableApplyTo'],
				},
			},
			'SourceRef → direct + behavior-description refs (LNodeInputRef, InputVar) + VariableApplyTo':
				{
					tagName: 'SourceRef',
					expected: {
						length: 3,
						refTagNames: ['InputVar', 'LNodeInputRef', 'VariableApplyTo'],
					},
				},
			'ConnectivityNode → the terminals naming it (Terminal, NeutralPoint) + VariableApplyTo': {
				tagName: 'ConnectivityNode',
				expected: {
					length: 3,
					refTagNames: ['NeutralPoint', 'Terminal', 'VariableApplyTo'],
				},
			},
			'unknown tagName → empty': {
				tagName: 'Nonexistent',
				expected: { length: 0, refTagNames: [] },
			},
		}

		function act(testCase: TestCase) {
			const entries = REF_ENTRIES_BY_TARGET.get(testCase.tagName) ?? []
			expect(entries).toHaveLength(testCase.expected.length)
			const refTagNames = [...new Set(entries.map((e: RefEntry) => e.refTagName))]
			expect(refTagNames.sort()).toEqual(testCase.expected.refTagNames.sort())
		}

		runSclTestCases.generic(testCases, act)
	})
})
