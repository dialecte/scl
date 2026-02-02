import { SCL_DIALECTE_CONFIG } from '../config/dialecte.config'
import { afterStandardizedRecord } from './after-standardized-record'

import { describe, it, expect } from 'vitest'

import type { Scl } from '../config'
import type * as Core from '@dialecte/core'

describe('afterStandardizedRecord', () => {
	type TestCase = {
		description: string
		input: {
			record: Core.AnyRawRecord
		}
		expected: {
			hasUuidAttribute: boolean
			uuidValue?: string | 'generated'
			namespace?: Core.Namespace
		}
	}

	const testCases: TestCase[] = [
		{
			description: 'adds uuid when element supports uuid and has no uuid attribute',
			input: {
				record: {
					id: '0-0-0-0-1',
					tagName: 'Function',
					attributes: [{ name: 'name', value: 'TestFunction' }],
					namespace: SCL_DIALECTE_CONFIG.namespaces.default,
					value: '',
					children: [],
					parent: { tagName: 'Substation', id: 'sub1' },
				} satisfies Scl.RawRecord<'Function'>,
			},
			expected: {
				hasUuidAttribute: true,
				uuidValue: 'generated',
			},
		},
		{
			description: 'adds uuid when element has empty uuid attribute',
			input: {
				record: {
					id: '0-0-0-0-2',
					tagName: 'Function',
					attributes: [
						{ name: 'name', value: 'TestFunction' },
						{ name: 'uuid', value: '' },
					],
					namespace: SCL_DIALECTE_CONFIG.namespaces.default,
					value: '',
					children: [],
					parent: { tagName: 'Substation', id: 'sub1' },
				} satisfies Scl.RawRecord<'Function'>,
			},
			expected: {
				hasUuidAttribute: true,
				uuidValue: 'generated',
			},
		},
		{
			description: 'keeps existing valid uuid',
			input: {
				record: {
					id: '0-0-0-0-3',
					tagName: 'Function',
					attributes: [
						{ name: 'name', value: 'TestFunction' },
						{ name: 'uuid', value: '123e4567-e89b-12d3-a456-426614174000' },
					],
					namespace: SCL_DIALECTE_CONFIG.namespaces.default,
					value: '',
					children: [],
					parent: { tagName: 'Substation', id: 'sub1' },
				} satisfies Scl.RawRecord<'Function'>,
			},
			expected: {
				hasUuidAttribute: true,
				uuidValue: '123e4567-e89b-12d3-a456-426614174000',
			},
		},
		{
			description: 'does not add uuid when element does not support uuid',
			input: {
				record: {
					id: '0-0-0-0-4',
					tagName: 'Text',
					attributes: [],
					namespace: SCL_DIALECTE_CONFIG.namespaces.default,
					value: '',
					children: [],
					parent: { tagName: 'Header', id: 'header1' },
				} satisfies Scl.RawRecord<'Text'>,
			},
			expected: {
				hasUuidAttribute: false,
			},
		},
	]

	testCases.forEach((testCase) => {
		it(testCase.description, () => {
			// Act
			const result = afterStandardizedRecord({
				record: testCase.input.record as Scl.RawRecord<Scl.ElementsOf>,
			})

			// Assert
			const uuidAttribute = result.attributes.find((attr) => attr.name === 'uuid')

			if (testCase.expected.hasUuidAttribute) {
				expect(uuidAttribute).toBeDefined()

				if (testCase.expected.uuidValue === 'generated') {
					// Verify it's a valid UUID format
					expect(uuidAttribute?.value).toMatch(
						/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
					)
				} else if (testCase.expected.uuidValue) {
					expect(uuidAttribute?.value).toBe(testCase.expected.uuidValue)
				}
			} else {
				expect(uuidAttribute).toBeUndefined()
			}

			// Verify other attributes are preserved
			const nonUuidAttributes = result.attributes.filter((attr) => attr.name !== 'uuid')
			const inputNonUuidAttributes = testCase.input.record.attributes.filter(
				(attr) => attr.name !== 'uuid',
			)
			expect(nonUuidAttributes).toEqual(inputNonUuidAttributes)
		})
	})
})
