import { SCL_DIALECTE_CONFIG } from '../config/dialecte.config'
import { afterStandardizedRecord } from './after-standardized-record'

import { describe, it, expect } from 'vitest'

import type { Scl } from '../config'
import type * as Core from '@dialecte/core'

describe('afterStandardizedRecord', () => {
	type TestCase = {
		input: { record: Core.AnyRawRecord }
		expected: {
			hasUuidAttribute: boolean
			uuidValue?: string | 'generated'
		}
	}

	const testCases: Record<string, TestCase> = {
		'element supports uuid + no uuid attribute → uuid generated': {
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
			expected: { hasUuidAttribute: true, uuidValue: 'generated' },
		},
		'element supports uuid + empty uuid attribute → uuid generated': {
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
			expected: { hasUuidAttribute: true, uuidValue: 'generated' },
		},
		'element supports uuid + valid uuid present → uuid preserved': {
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
			expected: { hasUuidAttribute: true, uuidValue: '123e4567-e89b-12d3-a456-426614174000' },
		},
		'element does not support uuid → no uuid attribute added': {
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
			expected: { hasUuidAttribute: false },
		},
	}

	it.each(Object.entries(testCases))('%s', (_, testCase) => {
		const result = afterStandardizedRecord({
			record: testCase.input.record as Scl.RawRecord<Scl.ElementsOf>,
		})

		const uuidAttribute = result.attributes.find((attr) => attr.name === 'uuid')

		if (testCase.expected.hasUuidAttribute) {
			expect(uuidAttribute).toBeDefined()
			if (testCase.expected.uuidValue === 'generated') {
				expect(uuidAttribute?.value).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
				)
			} else if (testCase.expected.uuidValue) {
				expect(uuidAttribute?.value).toBe(testCase.expected.uuidValue)
			}
		} else {
			expect(uuidAttribute).toBeUndefined()
		}

		const nonUuidAttributes = result.attributes.filter((attr) => attr.name !== 'uuid')
		const inputNonUuidAttributes = testCase.input.record.attributes.filter(
			(attr) => attr.name !== 'uuid',
		)
		expect(nonUuidAttributes).toEqual(inputNonUuidAttributes)
	})
})
