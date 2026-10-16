import { splitDataPath } from './split-data-path'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DataPathSplit, DataTypes } from './data-types.types'
import type { SclTest } from '@/v2019C1/test'

/**
 * A logical node type `PTRC_T` with a data object `Op` (a single-level data object `ACT_T`) and a
 * data object `PhV` whose sub data object `phsA` (`CMV_T`) holds a structured data attribute `cVal`
 * (`CVAL_T`) nested down to a measured value `mag.f`.
 */
const TYPES: DataTypes = {
	lnodeTypesById: new Map([
		[
			'PTRC_T',
			[
				{ name: 'Op', type: 'ACT_T' },
				{ name: 'PhV', type: 'WYE_T' },
			],
		],
	]),
	doTypesById: new Map([
		[
			'ACT_T',
			{
				subObjects: [],
				attributes: [
					{ name: 'general', bType: 'BOOLEAN' },
					{ name: 'q', bType: 'Quality' },
				],
			},
		],
		['WYE_T', { subObjects: [{ name: 'phsA', type: 'CMV_T' }], attributes: [] }],
		[
			'CMV_T',
			{
				subObjects: [],
				attributes: [
					{ name: 'cVal', bType: 'Struct', type: 'CVAL_T' },
					{ name: 't', bType: 'Timestamp' },
				],
			},
		],
	]),
	daTypesById: new Map([
		['CVAL_T', [{ name: 'mag', bType: 'Struct', type: 'AV_T' }]],
		['AV_T', [{ name: 'f', bType: 'FLOAT32' }]],
	]),
}

const WITHOUT_OBJECT_TYPES: DataTypes = {
	lnodeTypesById: TYPES.lnodeTypesById,
	doTypesById: new Map(),
	daTypesById: new Map(),
}

describe('splitDataPath', () => {
	type TestCase = SclTest.BaseTestCase & {
		qualifier: string
		lnType: string
		types?: DataTypes
		dataObjectOnly?: boolean
		expected: DataPathSplit | undefined
	}

	const testCases: Record<string, TestCase> = {
		'sub data object, structured attribute nested two levels → split between the sub data object and the attribute':
			{
				qualifier: 'PhV.phsA.cVal.mag.f',
				lnType: 'PTRC_T',
				expected: { doName: 'PhV.phsA', daName: 'cVal.mag.f' },
			},
		'data object only → no data attribute': {
			qualifier: 'Op',
			lnType: 'PTRC_T',
			expected: { doName: 'Op' },
		},
		'data object and a data attribute of its type → split after the data object': {
			qualifier: 'Op.general',
			lnType: 'PTRC_T',
			expected: { doName: 'Op', daName: 'general' },
		},
		'sub data object only → the data object is the dotted pair': {
			qualifier: 'PhV.phsA',
			lnType: 'PTRC_T',
			expected: { doName: 'PhV.phsA' },
		},
		'structured attribute where the path stops → the attribute is the structured one': {
			qualifier: 'PhV.phsA.cVal',
			lnType: 'PTRC_T',
			expected: { doName: 'PhV.phsA', daName: 'cVal' },
		},
		'logical node type the document lacks → no split': {
			qualifier: 'Op.general',
			lnType: 'XCBR_T',
			expected: undefined,
		},
		'data object its logical node type lacks → no split': {
			qualifier: 'Pos.stVal',
			lnType: 'PTRC_T',
			expected: undefined,
		},
		'data attribute its data object type lacks → no split': {
			qualifier: 'Op.stVal',
			lnType: 'PTRC_T',
			expected: undefined,
		},
		'segment after an attribute that holds no structure → no split': {
			qualifier: 'Op.general.extra',
			lnType: 'PTRC_T',
			expected: undefined,
		},
		'nested attribute its attribute type lacks → no split': {
			qualifier: 'PhV.phsA.cVal.mag.i',
			lnType: 'PTRC_T',
			expected: undefined,
		},
		'data object whose type the document lacks, a data attribute asked → no split': {
			qualifier: 'Op.general',
			lnType: 'PTRC_T',
			types: WITHOUT_OBJECT_TYPES,
			expected: undefined,
		},
		'data object whose type the document lacks, the path stopping on it → the data object': {
			qualifier: 'Op',
			lnType: 'PTRC_T',
			types: WITHOUT_OBJECT_TYPES,
			expected: { doName: 'Op' },
		},
		'data object only asked, a path reaching a data attribute → no split': {
			qualifier: 'Op.general',
			lnType: 'PTRC_T',
			dataObjectOnly: true,
			expected: undefined,
		},
		'data object only asked, a path through a sub data object → the data object': {
			qualifier: 'PhV.phsA',
			lnType: 'PTRC_T',
			dataObjectOnly: true,
			expected: { doName: 'PhV.phsA' },
		},
		'empty qualifier → no split': {
			qualifier: '',
			lnType: 'PTRC_T',
			expected: undefined,
		},
	}

	function act(testCase: TestCase) {
		const { qualifier, lnType, types = TYPES, dataObjectOnly } = testCase
		expect(splitDataPath({ qualifier, lnType, types, dataObjectOnly })).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
