/// <reference types="vite/client" />

import { planTypeClosure, readClosureTypeModel } from './closure'
import SenderWithTwoGooseBlocksXml from './fixtures/sender-with-two-goose-blocks.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	logicalNodes: { tagName: 'LN' | 'LN0'; id: string }[]
	types: string[]
}

describe('planTypeClosure - the types of the kept logical nodes and every type they reach', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'PTOC1 -> its logical node type, its data object type and the enumeration a data attribute names':
			{
				sourceXml: SenderWithTwoGooseBlocksXml,
				logicalNodes: [{ tagName: 'LN', id: 'ptoc1' }],
				types: ['PTOC_Type', 'ACT_Type', 'Dir_Enum'],
			},
		'XCBR1 -> through a sub data object and a structure, down to the enumeration of a structure attribute':
			{
				sourceXml: SenderWithTwoGooseBlocksXml,
				logicalNodes: [{ tagName: 'LN', id: 'xcbr1' }],
				types: ['XCBR_Type', 'DPC_Type', 'Origin_DO', 'Origin_DA', 'OrCat_Enum'],
			},
		'two LN0 and a GGIO sharing a data object type -> each type once, none of the types nothing reaches':
			{
				sourceXml: SenderWithTwoGooseBlocksXml,
				logicalNodes: [
					{ tagName: 'LN0', id: 'ld1-ln0' },
					{ tagName: 'LN0', id: 'ld2-ln0' },
					{ tagName: 'LN', id: 'ggio1' },
				],
				types: ['LLN0_Type', 'GGIO_Type', 'SPS_Type'],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const ids = new Set(testCase.logicalNodes.map((ref) => ref.id))
			const candidates = [
				...(await source.query.getRecordsByTagName('LN0')),
				...(await source.query.getRecordsByTagName('LN')),
			]
			const records = candidates.filter((record) => ids.has(record.id))
			const closure = readClosureTypeModel(source.query).then((types) =>
				planTypeClosure({ types, logicalNodes: records }),
			)
			await expect(closure.then((ids) => [...ids].sort())).resolves.toEqual(
				[...testCase.types].sort(),
			)
		},
	})
})
