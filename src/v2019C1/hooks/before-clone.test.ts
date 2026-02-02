import { beforeClone } from './before-clone'

import { describe, it, expect } from 'vitest'

import type * as Core from '@dialecte/core'

describe('beforeClone', () => {
	type TestCase = {
		description: string
		input: Omit<Core.AnyTreeRecord, 'namespace' | 'parent' | 'children' | 'value' | 'status'>
		expected: {
			shouldBeCloned: boolean
			record: Omit<Core.AnyTreeRecord, 'namespace' | 'parent' | 'children' | 'value' | 'status'>
		}
		only?: boolean
	}

	const testCases: TestCase[] = [
		{
			description: 'removes uuid attribute from record',
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
		{
			description: 'returns unchanged record when no uuid attribute',
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
		{
			description: 'handles record with empty attributes',
			input: {
				id: 'test-id',
				tagName: 'Function',
				attributes: [],
				tree: [],
			},
			expected: {
				shouldBeCloned: true,
				record: {
					id: 'test-id',
					tagName: 'Function',
					attributes: [],
					tree: [],
				},
			},
		},
		{
			description: 'removes multiple uuid attributes if present',
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
		{
			description: 'skips empty Private element',
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
		{
			description: 'clones Private element with children',
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
	]

	testCases.forEach(testBeforeClone)

	function testBeforeClone(testCase: TestCase) {
		it(testCase.description, () => {
			const treeRecordPart = {
				namespace: { prefix: '', uri: '' },
				parent: null,
				children: [],
				value: '',
				status: 'unchanged' as const,
			}

			// Act
			const result = beforeClone({
				record: {
					...testCase.input,
					...treeRecordPart,
				},
			})

			// Assert
			expect(result.shouldBeCloned).toBe(testCase.expected.shouldBeCloned)
			expect(result.transformedRecord).toEqual({
				...testCase.expected.record,
				...treeRecordPart,
			})
		})
	}
})
