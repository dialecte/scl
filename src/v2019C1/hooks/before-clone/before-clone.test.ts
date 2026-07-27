import { beforeClone } from './before-clone'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

describe('beforeClone', () => {
	type TestCase = SclTest.BaseTestCase & {
		input: Omit<Core.AnyTreeRecord, 'namespace' | 'parent' | 'children' | 'value' | 'status'>
		namespace?: Core.Namespace
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

	const V2019C1_URI = 'http://www.iec.ch/61850/2019/SCL/6-100'
	const supportedChild = (tagName: string) => ({
		id: `child-${tagName}`,
		tagName,
		attributes: [],
		namespace: { prefix: 'eIEC61850-6-100', uri: V2019C1_URI },
		parent: null,
		children: [],
		value: '',
		status: 'unchanged' as const,
		tree: [],
	})

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
		'type-only empty Private element → cloned (vendor flag)': {
			input: {
				id: 'test-id',
				tagName: 'Private',
				attributes: [{ name: 'type', value: 'some-type' }],
				tree: [],
			},
			expected: {
				shouldBeCloned: true,
				record: {
					id: 'test-id',
					tagName: 'Private',
					attributes: [{ name: 'type', value: 'some-type' }],
					tree: [],
				},
			},
		},
		'truly-empty Private element (no type, value, children) → skipped': {
			input: {
				id: 'test-id',
				tagName: 'Private',
				attributes: [],
				tree: [],
			},
			expected: {
				shouldBeCloned: false,
				record: {
					id: 'test-id',
					tagName: 'Private',
					attributes: [],
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
		'unknown element in a supported namespace → skipped (deprecated SsdReference)': {
			input: {
				id: 'test-id',
				tagName: 'SsdReference',
				attributes: [{ name: 'desc', value: 'SET_Sample1' }],
				tree: [],
			},
			namespace: { prefix: 'eIEC61850-6-100', uri: V2019C1_URI },
			expected: {
				shouldBeCloned: false,
				record: {
					id: 'test-id',
					tagName: 'SsdReference',
					attributes: [{ name: 'desc', value: 'SET_Sample1' }],
					tree: [],
				},
			},
		},
		'known element in a supported namespace → cloned (DOS)': {
			input: {
				id: 'test-id',
				tagName: 'DOS',
				attributes: [{ name: 'name', value: 'Pos' }],
				tree: [],
			},
			namespace: { prefix: 'eIEC61850-6-100', uri: V2019C1_URI },
			expected: {
				shouldBeCloned: true,
				record: {
					id: 'test-id',
					tagName: 'DOS',
					attributes: [{ name: 'name', value: 'Pos' }],
					tree: [],
				},
			},
		},
		'unknown element in a foreign namespace → cloned (vendor content preserved)': {
			input: {
				id: 'test-id',
				tagName: 'VendorThing',
				attributes: [],
				tree: [],
			},
			namespace: { prefix: 'vendor', uri: 'http://example.com/vendor' },
			expected: {
				shouldBeCloned: true,
				record: { id: 'test-id', tagName: 'VendorThing', attributes: [], tree: [] },
			},
		},
		'Private wrapping only deprecated supported-ns elements → skipped': {
			input: {
				id: 'test-id',
				tagName: 'Private',
				attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
				tree: [supportedChild('SsdReference')],
			},
			expected: {
				shouldBeCloned: false,
				record: {
					id: 'test-id',
					tagName: 'Private',
					attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
					tree: [supportedChild('SsdReference')],
				},
			},
		},
		'Private wrapping a known supported-ns element alongside a deprecated one → cloned': {
			input: {
				id: 'test-id',
				tagName: 'Private',
				attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
				tree: [supportedChild('DOS'), supportedChild('SsdReference')],
			},
			expected: {
				shouldBeCloned: true,
				record: {
					id: 'test-id',
					tagName: 'Private',
					attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
					tree: [supportedChild('DOS'), supportedChild('SsdReference')],
				},
			},
		},
		'empty Private of a supported-namespace type → skipped (no meaningful content)': {
			input: {
				id: 'test-id',
				tagName: 'Private',
				attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
				tree: [],
			},
			expected: {
				shouldBeCloned: false,
				record: {
					id: 'test-id',
					tagName: 'Private',
					attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
					tree: [],
				},
			},
		},
	}

	function act(testCase: TestCase) {
		const namespace = testCase.namespace ?? treeRecordPart.namespace
		const record = {
			...testCase.input,
			...treeRecordPart,
			namespace,
		} as unknown as Scl.TreeRecord<Scl.ElementsOf>
		const result = beforeClone({ record })

		expect(result.shouldBeCloned).toBe(testCase.expected.shouldBeCloned)
		expect(result.transformedRecord).toEqual({
			...testCase.expected.record,
			...treeRecordPart,
			namespace,
		})
	}

	runSclTestCases.generic(testCases, act)
})
