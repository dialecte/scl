import { beforeClone } from './before-clone'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

describe('beforeClone', () => {
	type TestCase = SclTest.BaseTestCase & {
		input: Omit<Core.AnyTreeRecord, 'namespace' | 'parent' | 'children' | 'value' | 'status'>
		expected: {
			shouldBeCloned: boolean
			record: Omit<Core.AnyTreeRecord, 'namespace' | 'parent' | 'children' | 'value' | 'status'>
		}
	}

	const treeRecordPart = {
		namespace: { prefix: '', uri: '' },
		parent: null,
		children: [],
		value: '',
		status: 'unchanged' as const,
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'uuid attribute present → uuid removed': {
			input: {
				id: 'test-id',
				tagName: 'Function',
				attributes: [
					{ name: 'name', value: 'TestFunction' },
					{ name: 'uuid', value: '123e4567-e89b-12d3-a456-426614174000' },
					{ name: 'type', value: 'FunctionType' },
				],
				tree: [],
			},
			expected: {
				shouldBeCloned: true,
				record: {
					id: 'test-id',
					tagName: 'Function',
					attributes: [
						{ name: 'name', value: 'TestFunction' },
						{ name: 'type', value: 'FunctionType' },
					],
					tree: [],
				},
			},
		},
		'no uuid attribute → record unchanged': {
			input: {
				id: 'test-id',
				tagName: 'SubFunction',
				attributes: [
					{ name: 'name', value: 'TestSubFunction' },
					{ name: 'type', value: 'SubFunctionType' },
				],
				tree: [],
			},
			expected: {
				shouldBeCloned: true,
				record: {
					id: 'test-id',
					tagName: 'SubFunction',
					attributes: [
						{ name: 'name', value: 'TestSubFunction' },
						{ name: 'type', value: 'SubFunctionType' },
					],
					tree: [],
				},
			},
		},
		'empty attributes → record unchanged': {
			input: {
				id: 'test-id',
				tagName: 'Function',
				attributes: [],
				tree: [],
			},
			expected: {
				shouldBeCloned: true,
				record: { id: 'test-id', tagName: 'Function', attributes: [], tree: [] },
			},
		},
		'multiple uuid attributes → all uuid attributes removed': {
			input: {
				id: 'test-id',
				tagName: 'Function',
				attributes: [
					{ name: 'name', value: 'TestFunction' },
					{ name: 'uuid', value: '123e4567-e89b-12d3-a456-426614174000' },
					{ name: 'uuid', value: '987fcdeb-51a2-43f7-8c3d-12e45678901f' },
					{ name: 'type', value: 'FunctionType' },
				],
				tree: [],
			},
			expected: {
				shouldBeCloned: true,
				record: {
					id: 'test-id',
					tagName: 'Function',
					attributes: [
						{ name: 'name', value: 'TestFunction' },
						{ name: 'type', value: 'FunctionType' },
					],
					tree: [],
				},
			},
		},
		'empty Private element → skipped (shouldBeCloned=false)': {
			input: {
				id: 'test-id',
				tagName: 'Private',
				attributes: [{ name: 'type', value: 'some-type' }],
				tree: [],
			},
			expected: {
				shouldBeCloned: false,
				record: {
					id: 'test-id',
					tagName: 'Private',
					attributes: [{ name: 'type', value: 'some-type' }],
					tree: [],
				},
			},
		},
		'Private element with children → cloned': {
			input: {
				id: 'test-id',
				tagName: 'Private',
				attributes: [{ name: 'type', value: 'some-type' }],
				tree: [
					{
						id: 'child-id',
						tagName: 'LNodeSpecNaming',
						attributes: [],
						namespace: { prefix: '', uri: '' },
						parent: null,
						children: [],
						value: '',
						status: 'unchanged' as const,
						tree: [],
					},
				],
			},
			expected: {
				shouldBeCloned: true,
				record: {
					id: 'test-id',
					tagName: 'Private',
					attributes: [{ name: 'type', value: 'some-type' }],
					tree: [
						{
							id: 'child-id',
							tagName: 'LNodeSpecNaming',
							attributes: [],
							namespace: { prefix: '', uri: '' },
							parent: null,
							children: [],
							value: '',
							status: 'unchanged' as const,
							tree: [],
						},
					],
				},
			},
		},
	}

	function act(testCase: TestCase) {
		const record = {
			...testCase.input,
			...treeRecordPart,
		} as unknown as Scl.TreeRecord<Scl.ElementsOf>
		const result = beforeClone({ record })

		expect(result.shouldBeCloned).toBe(testCase.expected.shouldBeCloned)
		expect(result.transformedRecord).toEqual({ ...testCase.expected.record, ...treeRecordPart })
	}

	runSclTestCases.generic(testCases, act)
})
