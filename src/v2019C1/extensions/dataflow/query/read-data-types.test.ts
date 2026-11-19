import withValuesXml from './fixtures/data-types-with-values.xml?raw'
import withoutValuesXml from './fixtures/data-types-without-values.xml?raw'
import { readDataTypes } from './read-data-types'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { Config } from '@/v2019C1/config'
import type { DataTypes } from '@/v2019C1/extensions/data-model/query/data-types.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

/** The store calls that read records, counted by the dev perf counters. */
const STORE_READS = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByAttributes',
	'core::store::getByDocumentId',
] as const

/** The records the store calls move, counted by the dev perf counters. */
const RECORDS_MOVED = [
	'core::store::records.get',
	'core::store::records.getMany',
	'core::store::records.getByTagName',
	'core::store::records.getByAttributes',
	'core::store::records.getByDocumentId',
] as const

/** The data types of `data-types-with-values.xml` (and of its twin without values). */
const FIXTURE_DATA_TYPES: DataTypes = {
	lnodeTypesById: new Map([
		[
			'T1',
			[
				{ name: 'Beh', type: 'ENS' },
				{ name: 'Pos', type: 'DPC' },
			],
		],
		['T0', [{ name: 'Beh', type: 'ENS' }]],
	]),
	doTypesById: new Map([
		[
			'ENS',
			{
				subObjects: [],
				attributes: [
					{ name: 'stVal', type: 'BEH', bType: 'Enum' },
					{ name: 'q', bType: 'Quality' },
				],
			},
		],
		[
			'DPC',
			{
				subObjects: [{ name: 'sub', type: 'ENS' }],
				attributes: [{ name: 'origin', type: 'ORIG', bType: 'Struct' }],
			},
		],
	]),
	daTypesById: new Map([
		[
			'ORIG',
			[
				{ name: 'orCat', type: 'ORCAT', bType: 'Enum' },
				{ name: 'f', bType: 'FLOAT32' },
			],
		],
	]),
}

/** The sum of the given perf tallies over one `readDataTypes` call. */
async function talliesOf(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
	keys: readonly string[]
}): Promise<number> {
	const { source, keys } = params
	source.perf.reset()
	await readDataTypes(source.query)
	const report = source.perf.report()
	return keys.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0)
}

/** The data types of a document: every type of the data model by id, with its members, values and texts aside. */
describe('readDataTypes - the data types', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: DataTypes }

	const testCases: SclTest.TestCases<TestCase> = {
		'types holding values and texts, values outside the types → the types and their members': {
			// two LNodeTypes, two DOTypes (one SDO), one DAType; Val in DA, BDA and DAI; Text in types and a Substation
			sourceXml: withValuesXml,
			expected: FIXTURE_DATA_TYPES,
		},
		'the same types without values or texts → the same types and members': {
			// data-types-with-values.xml without its Val and Text elements
			sourceXml: withoutValuesXml,
			expected: FIXTURE_DATA_TYPES,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const dataTypes = await readDataTypes(source.query)
			expect(dataTypes).toEqual(testCase.expected)
		},
	})
})

/** Inside a transaction the data types are the staged ones. */
describe('readDataTypes - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** Staged before the call, in the transaction it runs in. */
		stage: (tx: Core.Transaction<Config>) => Promise<void>
		expected: DataTypes
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a DOType added, a DO renamed to it, a DA deleted → the staged types': {
			// two LNodeTypes, two DOTypes (one SDO), one DAType; Val in DA, BDA and DAI; Text in types and a Substation
			sourceXml: withValuesXml,
			stage: async (tx) => {
				const added = await tx.addChild(
					{ tagName: 'DataTypeTemplates', id: 'dtt-1' },
					{ tagName: 'DOType', attributes: { id: 'ADDED', cdc: 'SPS' } },
				)
				await tx.addChild(added, {
					tagName: 'DA',
					attributes: { name: 'stVal', bType: 'BOOLEAN', fc: 'ST' },
				})
				await tx.update({ tagName: 'DO', id: 'do-1-pos' }, { attributes: { type: 'ADDED' } })
				await tx.delete({ tagName: 'DA', id: 'da-ens-q' })
			},
			expected: {
				lnodeTypesById: new Map([
					[
						'T1',
						[
							{ name: 'Beh', type: 'ENS' },
							{ name: 'Pos', type: 'ADDED' },
						],
					],
					['T0', [{ name: 'Beh', type: 'ENS' }]],
				]),
				doTypesById: new Map([
					['ENS', { subObjects: [], attributes: [{ name: 'stVal', type: 'BEH', bType: 'Enum' }] }],
					[
						'DPC',
						{
							subObjects: [{ name: 'sub', type: 'ENS' }],
							attributes: [{ name: 'origin', type: 'ORIG', bType: 'Struct' }],
						},
					],
					['ADDED', { subObjects: [], attributes: [{ name: 'stVal', bType: 'BOOLEAN' }] }],
				]),
				daTypesById: FIXTURE_DATA_TYPES.daTypesById,
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await source.transaction(async (tx) => {
				await testCase.stage(tx)
				const dataTypes = await readDataTypes(tx)
				expect(dataTypes).toEqual(testCase.expected)
			})
		},
	})
})

/**
 * The data types are read by the tags of the types and their members only: the values and texts of the document,
 * in the types or outside them, are never read.
 */
describe('readDataTypes - the store reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: { storeReads: number } }

	const testCases: SclTest.TestCases<TestCase> = {
		'a document → 11 store reads: the root (twice), Private, DataTypeTemplates, three type and four member tags':
			{
				// two LNodeTypes, two DOTypes (one SDO), one DAType; Val in DA, BDA and DAI; Text in types and a Substation
				sourceXml: withValuesXml,
				expected: { storeReads: 11 },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const storeReads = await talliesOf({ source, keys: STORE_READS })
			expect({ storeReads }).toEqual(testCase.expected)
		},
	})
})

/**
 * Values and texts, in the types or outside them, move no record: a document moves what its twin without them moves,
 * the root (read twice), the Private the import adds, DataTypeTemplates and its types and members.
 */
describe('readDataTypes - the records moved', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: { recordsMoved: number } }

	const testCases: SclTest.TestCases<TestCase> = {
		'Val in DA, BDA and DAI, Text in types and a Substation → 18: the root twice, the Private the import adds, DataTypeTemplates and its 14 types and members':
			{
				// two LNodeTypes, two DOTypes (one SDO), one DAType; Val in DA, BDA and DAI; Text in types and a Substation
				sourceXml: withValuesXml,
				expected: { recordsMoved: 18 },
			},
		'the twin without values or texts → as many records': {
			// data-types-with-values.xml without its Val and Text elements
			sourceXml: withoutValuesXml,
			expected: { recordsMoved: 18 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const recordsMoved = await talliesOf({ source, keys: RECORDS_MOVED })
			expect({ recordsMoved }).toEqual(testCase.expected)
		},
	})
})
