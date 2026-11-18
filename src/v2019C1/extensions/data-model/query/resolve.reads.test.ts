import twelveLNodesXml from './fixtures/twelve-lnodes-of-four-types.xml?raw'
import { resolve } from './resolve'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

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

/** The LNodes of the fixture: twelve, of four LNodeTypes sharing their DOTypes, DATypes and EnumTypes. */
const EVERY_LNODE = Array.from({ length: 12 }, (_, index) => `lnode-${index}`)

/** One LNode of each of the four LNodeTypes. */
const ONE_LNODE_PER_TYPE = ['lnode-0', 'lnode-1', 'lnode-2', 'lnode-3']

/** The records the store calls of one `resolve` of the LNodes move. */
async function recordsMovedOf(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
	lnodeIds: string[]
}): Promise<number> {
	const { source, lnodeIds } = params
	const query = source.query
	const records = await query.getRecords(
		lnodeIds.map((id): Scl.Ref<'LNode'> => ({ tagName: 'LNode', id })),
	)
	source.perf.reset()
	await resolve(query, { records: records.filter((record) => !!record) })
	const report = source.perf.report()
	return RECORDS_MOVED.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0)
}

/**
 * Resolving the data types of many LNodes reads them level by level from their LNodeTypes: the store reads follow the
 * depth of the data model and the types reached, not the number of LNodes; the records moved are those the walk reaches.
 */
describe('resolve - the store reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodeIds: string[]
		expected: { storeReads: number; lnodeTypes: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'one LNode → 8 store reads (two per level of its types)': {
			// twelve LNodes of four LNodeTypes, sharing DOTypes, nested DATypes and EnumTypes
			sourceXml: twelveLNodesXml,
			lnodeIds: ['lnode-0'],
			expected: { storeReads: 8, lnodeTypes: 1 },
		},
		'one LNode of each of the four types → 13 store reads': {
			// twelve LNodes of four LNodeTypes, sharing DOTypes, nested DATypes and EnumTypes
			sourceXml: twelveLNodesXml,
			lnodeIds: ONE_LNODE_PER_TYPE,
			expected: { storeReads: 13, lnodeTypes: 4 },
		},
		'twelve LNodes of the same four types → the store reads of one LNode per type': {
			// twelve LNodes of four LNodeTypes, sharing DOTypes, nested DATypes and EnumTypes
			sourceXml: twelveLNodesXml,
			lnodeIds: EVERY_LNODE,
			expected: { storeReads: 13, lnodeTypes: 4 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const query = source.query
			const records = await query.getRecords(
				testCase.lnodeIds.map((id): Scl.Ref<'LNode'> => ({ tagName: 'LNode', id })),
			)
			source.perf.reset()
			const result = await resolve(query, { records: records.filter((record) => !!record) })
			const report = source.perf.report()
			const storeReads = STORE_READS.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0)
			expect({ storeReads, lnodeTypes: result.lnodeTypes.length }).toEqual(testCase.expected)
		},
	})
})

/**
 * The records moved are those of the types reached and their members: more LNodes of the same types move the same
 * records, whatever the store (each counts what it moves its own way).
 */
describe('resolve - the records moved', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodeIds: string[]
		/** LNodes of the same types: the call is expected to move as many records. */
		sameTypesAs: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'twelve LNodes of four types → the records of one LNode per type': {
			// twelve LNodes of four LNodeTypes, sharing DOTypes, nested DATypes and EnumTypes
			sourceXml: twelveLNodesXml,
			lnodeIds: EVERY_LNODE,
			sameTypesAs: ONE_LNODE_PER_TYPE,
		},
		'three LNodes of one type → the records of one of them': {
			// twelve LNodes of four LNodeTypes, sharing DOTypes, nested DATypes and EnumTypes
			sourceXml: twelveLNodesXml,
			lnodeIds: ['lnode-0', 'lnode-4', 'lnode-8'],
			sameTypesAs: ['lnode-0'],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const moved = await recordsMovedOf({ source, lnodeIds: testCase.lnodeIds })
			const expected = await recordsMovedOf({ source, lnodeIds: testCase.sameTypesAs })
			expect(moved).toBe(expected)
		},
	})
})

/**
 * One LNode moves the records of its own types and their members, no more than one lookup per type did: pinned per
 * store, each counting what it moves its own way (the node project runs on the in-memory store, the browser on the
 * local one).
 */
describe('resolve - the records one LNode moves', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodeIds: string[]
		expected: { inMemory: number; local: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'one LNode → 14 records on the in-memory store, 26 on the local store': {
			// twelve LNodes of four LNodeTypes, sharing DOTypes, nested DATypes and EnumTypes
			sourceXml: twelveLNodesXml,
			lnodeIds: ['lnode-0'],
			expected: { inMemory: 14, local: 26 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const moved = await recordsMovedOf({ source, lnodeIds: testCase.lnodeIds })
			const store = typeof window === 'undefined' ? 'inMemory' : 'local'
			expect(moved).toBe(testCase.expected[store])
		},
	})
})
