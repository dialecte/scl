import { readValueImport } from './value-import'

import { describe, expect } from 'vitest'

import { createSclTestRecord, runSclTestCases } from '@/v2019C1/test'

import type { ReadValueImportParams } from './value-import.types'
import type { SclTest } from '@/v2019C1/test'

/** A `DAI` writing `valImport`, or not. */
function dai(valImport?: string) {
	return createSclTestRecord({
		record: {
			tagName: 'DAI',
			attributes: { name: 'ctlModel', ...(valImport === undefined ? {} : { valImport }) },
			parent: { tagName: 'DOI', id: 'doi' },
		},
	})
}

/** A data attribute (`DA` or `BDA`) writing `valImport`, or not. */
function dataAttribute(params: { tagName: 'DA' | 'BDA'; valImport?: string }) {
	const { tagName, valImport } = params
	const imported = valImport === undefined ? {} : { valImport }
	return tagName === 'DA'
		? createSclTestRecord({
				record: {
					tagName,
					attributes: { name: 'ctlModel', fc: 'CF', bType: 'Enum', ...imported },
					parent: { tagName: 'DOType', id: 'type' },
				},
			})
		: createSclTestRecord({
				record: {
					tagName,
					attributes: { name: 'ctlModel', bType: 'Enum', ...imported },
					parent: { tagName: 'DAType', id: 'type' },
				},
			})
}

describe('readValueImport', () => {
	type TestCase = SclTest.BaseTestCase & { params: ReadValueImportParams; expected: boolean }

	const testCases: Record<string, TestCase> = {
		'DAI valImport true, DA silent → true': {
			params: { instance: dai('true'), dataAttribute: dataAttribute({ tagName: 'DA' }) },
			expected: true,
		},
		'DAI valImport 1 → true': {
			params: {
				instance: dai('1'),
				dataAttribute: dataAttribute({ tagName: 'DA', valImport: 'false' }),
			},
			expected: true,
		},
		'DAI valImport false, DA true → false: the DAI overrides its type': {
			params: {
				instance: dai('false'),
				dataAttribute: dataAttribute({ tagName: 'DA', valImport: 'true' }),
			},
			expected: false,
		},
		'DAI valImport 0, DA true → false': {
			params: {
				instance: dai('0'),
				dataAttribute: dataAttribute({ tagName: 'DA', valImport: 'true' }),
			},
			expected: false,
		},
		'DAI silent, DA true → true: inherited from its type': {
			params: {
				instance: dai(),
				dataAttribute: dataAttribute({ tagName: 'DA', valImport: 'true' }),
			},
			expected: true,
		},
		'DAI silent, BDA true → true': {
			params: {
				instance: dai(),
				dataAttribute: dataAttribute({ tagName: 'BDA', valImport: 'true' }),
			},
			expected: true,
		},
		'DAI silent, DA false → false': {
			params: {
				instance: dai(),
				dataAttribute: dataAttribute({ tagName: 'DA', valImport: 'false' }),
			},
			expected: false,
		},
		'DAI and DA silent → false: the schema default': {
			params: { instance: dai(), dataAttribute: dataAttribute({ tagName: 'DA' }) },
			expected: false,
		},
		'DAI silent, no data attribute known → false': {
			params: { instance: dai() },
			expected: false,
		},
		'DAI true, no data attribute known → true': {
			params: { instance: dai('true') },
			expected: true,
		},
	}

	runSclTestCases.generic(testCases, (testCase) => {
		expect(readValueImport(testCase.params)).toBe(testCase.expected)
	})
})
