import { buildMappedDataAttributes } from './build-mapped-data-attributes'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type {
	BuildMappedDataAttributesParams,
	MappedDataAttributes,
} from './build-mapped-data-attributes.types'
import type { SclTest } from '@/v2019C1/test'

const PTOC1 = { lnId: 'ptoc1', lnUuid: 'ptoc1-uuid' }

describe('buildMappedDataAttributes', () => {
	type TestCase = SclTest.BaseTestCase & {
		params: BuildMappedDataAttributesParams
		expected: MappedDataAttributes
	}

	const testCases: Record<string, TestCase> = {
		'DOS implemented by its default -> default, nothing stored': {
			params: {
				tagName: 'DOS',
				implementation: { ...PTOC1, dataPath: ['Op'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['Op'] },
			},
			expected: { kind: 'default' },
		},
		'DOS implemented by another DO of the same logical node -> the DO name and the uuid': {
			params: {
				tagName: 'DOS',
				implementation: { ...PTOC1, dataPath: ['Health'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['Mod'] },
			},
			expected: { kind: 'deviation', mappedName: 'Health', mappedLnUuid: 'ptoc1-uuid' },
		},
		'DOS implemented by the same DO name in another logical node -> the pair, name kept': {
			params: {
				tagName: 'DOS',
				implementation: { lnId: 'ggio1', lnUuid: 'ggio1-uuid', dataPath: ['Op'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['Op'] },
			},
			expected: { kind: 'deviation', mappedName: 'Op', mappedLnUuid: 'ggio1-uuid' },
		},
		'DAS with no default (LNode not mapped) -> the full path from the logical node': {
			params: {
				tagName: 'DAS',
				implementation: { lnId: 'ggio1', lnUuid: 'ggio1-uuid', dataPath: ['Ind2', 'stVal'] },
				defaultData: { dataPath: ['Op', 'general'] },
			},
			expected: { kind: 'deviation', mappedName: 'Ind2.stVal', mappedLnUuid: 'ggio1-uuid' },
		},
		'DAS under a DOS mapped elsewhere, own deviation -> the full path, never the attribute alone': {
			params: {
				tagName: 'DAS',
				implementation: { ...PTOC1, dataPath: ['Beh', 'stVal'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['Health', 'stVal'] },
			},
			expected: { kind: 'deviation', mappedName: 'Beh.stVal', mappedLnUuid: 'ptoc1-uuid' },
		},
		'SDS implemented by a second sub data object level -> inexpressible': {
			params: {
				tagName: 'SDS',
				implementation: { ...PTOC1, dataPath: ['PhV', 'phsA', 'cVal'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['A', 'phsA', 'cVal'] },
			},
			expected: { kind: 'inexpressible' },
		},
		'SDS standing for an attribute structure -> inexpressible': {
			params: {
				tagName: 'SDS',
				implementation: { ...PTOC1, dataPath: ['Pos', 'Oper'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['Pos', 'SBOw'] },
			},
			expected: { kind: 'inexpressible' },
		},
		'SDS implemented by a first-level sub data object -> DO.sdo and the uuid': {
			params: {
				tagName: 'SDS',
				implementation: { lnId: 'ggio1', lnUuid: 'ggio1-uuid', dataPath: ['PhV', 'phsB'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['A', 'phsA'] },
			},
			expected: { kind: 'deviation', mappedName: 'PhV.phsB', mappedLnUuid: 'ggio1-uuid' },
		},
		'DAS below an array element -> the element written name(n)': {
			params: {
				tagName: 'DAS',
				implementation: { ...PTOC1, dataPath: ['HA', 'har(3)', 'mag'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['HA', 'har(2)', 'mag'] },
			},
			expected: { kind: 'deviation', mappedName: 'HA.har(3).mag', mappedLnUuid: 'ptoc1-uuid' },
		},
		'DOS path that is not a data object name -> inexpressible (DOS pattern is read)': {
			params: {
				tagName: 'DOS',
				implementation: { ...PTOC1, dataPath: ['phsA'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['Op'] },
			},
			expected: { kind: 'inexpressible' },
		},
		'DAS path without its data object -> inexpressible (DAS pattern is read)': {
			params: {
				tagName: 'DAS',
				implementation: { ...PTOC1, dataPath: ['stVal'] },
				defaultData: { lnId: 'ptoc1', dataPath: ['Op', 'general'] },
			},
			expected: { kind: 'inexpressible' },
		},
	}

	runSclTestCases.generic(testCases, (testCase) => {
		expect(buildMappedDataAttributes(testCase.params)).toEqual(testCase.expected)
	})
})
