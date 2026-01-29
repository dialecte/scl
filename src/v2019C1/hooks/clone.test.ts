import { beforeClone } from './clone'

import { describe, it, expect } from 'vitest'

import type * as Core from '@dialecte/core'

describe('beforeClone', () => {
	describe('UUID attribute filtering', () => {
		type TestCase = {
			desc: string
			input: Omit<Core.AnyChainRecord, 'namespace' | 'parent' | 'children' | 'value' | 'status'>
			expected: Omit<Core.AnyChainRecord, 'namespace' | 'parent' | 'children' | 'value' | 'status'>
			only?: boolean
		}

		const tests: TestCase[] = [
			{
				desc: 'removes uuid attribute from record',
				input: {
					id: 'test-id',
					tagName: 'Function',
					attributes: [
						{ name: 'name', value: 'TestFunction' },
						{ name: 'uuid', value: '123e4567-e89b-12d3-a456-426614174000' },
						{ name: 'type', value: 'FunctionType' },
					],
				},
				expected: {
					id: 'test-id',
					tagName: 'Function',
					attributes: [
						{ name: 'name', value: 'TestFunction' },
						{ name: 'type', value: 'FunctionType' },
					],
				},
			},
			{
				desc: 'returns unchanged record when no uuid attribute',
				input: {
					id: 'test-id',
					tagName: 'SubFunction',
					attributes: [
						{ name: 'name', value: 'TestSubFunction' },
						{ name: 'type', value: 'SubFunctionType' },
					],
				},
				expected: {
					id: 'test-id',
					tagName: 'SubFunction',
					attributes: [
						{ name: 'name', value: 'TestSubFunction' },
						{ name: 'type', value: 'SubFunctionType' },
					],
				},
			},
			{
				desc: 'handles record with empty attributes',
				input: {
					id: 'test-id',
					tagName: 'Function',
					attributes: [],
				},
				expected: {
					id: 'test-id',
					tagName: 'Function',
					attributes: [],
				},
			},
			{
				desc: 'removes multiple uuid attributes if present',
				input: {
					id: 'test-id',
					tagName: 'Function',
					attributes: [
						{ name: 'name', value: 'TestFunction' },
						{ name: 'uuid', value: '123e4567-e89b-12d3-a456-426614174000' },
						{ name: 'uuid', value: '987fcdeb-51a2-43f7-8c3d-12e45678901f' },
						{ name: 'type', value: 'FunctionType' },
					],
				},
				expected: {
					id: 'test-id',
					tagName: 'Function',
					attributes: [
						{ name: 'name', value: 'TestFunction' },
						{ name: 'type', value: 'FunctionType' },
					],
				},
			},
		]

		let testCases = tests
		const runOnlyTestCases = tests.filter((tc) => tc.only)
		if (runOnlyTestCases.length) {
			testCases = runOnlyTestCases
		}

		testCases.forEach(testBeforeClone)

		function testBeforeClone(tc: TestCase) {
			it(tc.desc, () => {
				const chainRecordPart = {
					namespace: { prefix: '', uri: '' },
					parent: null,
					children: [],
					value: '',
					status: 'unchanged' as const,
				}

				// Act
				const result = beforeClone({
					record: {
						...tc.input,
						...chainRecordPart,
					},
				})

				// Assert
				expect(result).toEqual({
					...tc.expected,
					...chainRecordPart,
				})
			})
		}
	})
})
