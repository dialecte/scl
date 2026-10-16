import { createDataTypeIndex } from './create-data-type-index'

import { describe, expect } from 'vitest'

import { createSclTestRecord, runSclTestCases } from '@/v2019C1/test'

import type { DataTypes } from './data-types.types'
import type { SclTest } from '@/v2019C1/test'
import type { AnyRawRecord } from '@dialecte/core'

type Fed = { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }

function record(tagName: string, attributes: Record<string, string>): AnyRawRecord {
	return createSclTestRecord({
		record: { tagName, attributes },
	} as Parameters<typeof createSclTestRecord>[0]) as AnyRawRecord
}

const lnodeType = record('LNodeType', { id: 'PTRC_T', lnClass: 'PTRC' })
const dataObject = record('DO', { name: 'Op', type: 'ACT_T' })
const dataObjectType = record('DOType', { id: 'ACT_T', cdc: 'ACT' })
const subObject = record('SDO', { name: 'phsA', type: 'CMV_T' })
const dataAttribute = record('DA', { name: 'general', bType: 'BOOLEAN', fc: 'ST' })
const structuredAttribute = record('DA', {
	name: 'cVal',
	bType: 'Struct',
	type: 'CVAL_T',
	fc: 'MX',
})
const dataAttributeType = record('DAType', { id: 'CVAL_T' })
const nestedAttribute = record('BDA', { name: 'mag', bType: 'Struct', type: 'AV_T' })

describe('createDataTypeIndex', () => {
	type TestCase = SclTest.BaseTestCase & {
		fed: readonly Fed[]
		expected: DataTypes
	}

	const testCases: Record<string, TestCase> = {
		'a logical node type and its data object → the data object under the type id': {
			fed: [
				{ record: lnodeType, ancestry: [] },
				{ record: dataObject, ancestry: [lnodeType] },
			],
			expected: {
				lnodeTypesById: new Map([['PTRC_T', [{ name: 'Op', type: 'ACT_T' }]]]),
				doTypesById: new Map(),
				daTypesById: new Map(),
			},
		},
		'a data object type, its sub data object and its data attributes → both lists': {
			fed: [
				{ record: dataObjectType, ancestry: [] },
				{ record: subObject, ancestry: [dataObjectType] },
				{ record: dataAttribute, ancestry: [dataObjectType] },
				{ record: structuredAttribute, ancestry: [dataObjectType] },
			],
			expected: {
				lnodeTypesById: new Map(),
				doTypesById: new Map([
					[
						'ACT_T',
						{
							subObjects: [{ name: 'phsA', type: 'CMV_T' }],
							attributes: [
								{ name: 'general', bType: 'BOOLEAN' },
								{ name: 'cVal', bType: 'Struct', type: 'CVAL_T' },
							],
						},
					],
				]),
				daTypesById: new Map(),
			},
		},
		'a data attribute type and its nested attribute → the nested attribute under the type id': {
			fed: [
				{ record: dataAttributeType, ancestry: [] },
				{ record: nestedAttribute, ancestry: [dataAttributeType] },
			],
			expected: {
				lnodeTypesById: new Map(),
				doTypesById: new Map(),
				daTypesById: new Map([['CVAL_T', [{ name: 'mag', bType: 'Struct', type: 'AV_T' }]]]),
			},
		},
		'a data object read before its logical node type, as an import pass hands them over → the same index':
			{
				fed: [
					{ record: dataObject, ancestry: [lnodeType] },
					{ record: lnodeType, ancestry: [] },
				],
				expected: {
					lnodeTypesById: new Map([['PTRC_T', [{ name: 'Op', type: 'ACT_T' }]]]),
					doTypesById: new Map(),
					daTypesById: new Map(),
				},
			},
		'a data object of an element that is no logical node type → ignored': {
			fed: [{ record: dataObject, ancestry: [record('LN', { lnClass: 'PTRC', inst: '1' })] }],
			expected: {
				lnodeTypesById: new Map(),
				doTypesById: new Map(),
				daTypesById: new Map(),
			},
		},
		'a type without id → ignored with its members': {
			fed: [
				{ record: record('LNodeType', { lnClass: 'PTRC' }), ancestry: [] },
				{ record: dataObject, ancestry: [record('LNodeType', { lnClass: 'PTRC' })] },
			],
			expected: {
				lnodeTypesById: new Map(),
				doTypesById: new Map(),
				daTypesById: new Map(),
			},
		},
	}

	function act(testCase: TestCase) {
		const index = createDataTypeIndex()
		for (const fed of testCase.fed) index.add(fed)
		expect(index.build()).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
