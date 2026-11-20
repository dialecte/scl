import sixBaysXml from './fixtures/six-bays-with-signals.xml?raw'
import { search } from './search'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SearchParams } from './search.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The store calls that move records, counted by the dev perf counters. */
const RECORDS_MOVED = [
	'core::store::records.get',
	'core::store::records.getMany',
	'core::store::records.getByTagName',
	'core::store::records.getByAttributes',
	'core::store::records.getByDocumentId',
] as const

/** The store calls themselves, by the dev perf counters. */
const STORE_CALLS = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByAttributes',
	'core::store::getByDocumentId',
] as const

/** The query methods that read a record in hand without the store; left out of the calls. */
const RECORD_READERS = new Set(['getAttributes', 'getAttribute'])

const THREE_TAGS: Scl.ElementsOf[] = ['Bay', 'LNode', 'SourceRef']

/** What one search costs: the hits, the query calls by name, the store calls and the records they move. */
type Cost = {
	hits: number
	calls: Record<string, number>
	storeCalls: number
	recordsMoved: number
}

function sumOf(params: {
	report: Record<string, { count?: number }>
	keys: readonly string[]
}): number {
	const { report, keys } = params
	let total = 0
	for (const key of keys) total += report[key]?.count ?? 0
	return total
}

/** One search on the case's source document, counted from the search's first read. */
async function costOf(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
	search: SearchParams
}): Promise<Cost> {
	const { source } = params
	const counted = countDocumentQueryReads(source.query)
	source.perf.reset()
	const hits = await search(counted.query, params.search)
	const report = source.perf.report()
	const calls: Record<string, number> = {}
	for (const { method } of counted.calls()) {
		if (!RECORD_READERS.has(method)) calls[method] = (calls[method] ?? 0) + 1
	}
	return {
		hits: hits.length,
		calls,
		storeCalls: sumOf({ report, keys: STORE_CALLS }),
		recordsMoved: sumOf({ report, keys: RECORDS_MOVED }),
	}
}

/**
 * The reads of one search do not follow the number of hits: one tag read per tag given (a repeat counts once), the
 * describer's batch (the signals' parents, then their signals), one ancestor read per level; none for an empty term.
 * Six bays, each with one LNode whose Private holds the SourceRefs `In(1)`-`In(3)`, the last one also `Close`.
 */
describe('search - the reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & { search: SearchParams; expected: Cost }

	const testCases: SclTest.TestCases<TestCase> = {
		'an empty term → no read': {
			sourceXml: sixBaysXml,
			search: { term: ' ', tagNames: THREE_TAGS },
			expected: { hits: 0, calls: {}, storeCalls: 0, recordsMoved: 0 },
		},
		'a limit of 0 → no read': {
			sourceXml: sixBaysXml,
			search: { term: 'in', tagNames: THREE_TAGS, limit: 0 },
			expected: { hits: 0, calls: {}, storeCalls: 0, recordsMoved: 0 },
		},
		'no hit over three tags → the tags and the describer, no ancestor read': {
			sourceXml: sixBaysXml,
			search: { term: 'busbar', tagNames: THREE_TAGS },
			expected: {
				hits: 0,
				calls: { getRecordsByTagName: 3, getRecords: 1, getChildrenOfEach: 1 },
				storeCalls: 5,
				recordsMoved: 56,
			},
		},
		'one Bay of one tag → one tag read, no describer read, one ancestor read per level': {
			sourceXml: sixBaysXml,
			search: { term: 'bay4', tagNames: ['Bay'] },
			expected: {
				hits: 1,
				calls: { getRecordsByTagName: 1, findAncestorsOfEach: 1 },
				storeCalls: 4,
				recordsMoved: 9,
			},
		},
		'one SourceRef → the tag, the describer, the ancestors': {
			sourceXml: sixBaysXml,
			search: { term: 'close', tagNames: ['SourceRef'] },
			expected: {
				hits: 1,
				calls: {
					getRecordsByTagName: 1,
					getRecords: 1,
					getChildrenOfEach: 1,
					findAncestorsOfEach: 1,
				},
				storeCalls: 10,
				recordsMoved: 51,
			},
		},
		'six SourceRefs at the same depth → the same calls as one': {
			sourceXml: sixBaysXml,
			search: { term: 'in(2', tagNames: ['SourceRef'] },
			expected: {
				hits: 6,
				calls: {
					getRecordsByTagName: 1,
					getRecords: 1,
					getChildrenOfEach: 1,
					findAncestorsOfEach: 1,
				},
				storeCalls: 10,
				recordsMoved: 72,
			},
		},
		'a tag given twice → read once': {
			sourceXml: sixBaysXml,
			search: { term: 'close', tagNames: ['SourceRef', 'SourceRef'] },
			expected: {
				hits: 1,
				calls: {
					getRecordsByTagName: 1,
					getRecords: 1,
					getChildrenOfEach: 1,
					findAncestorsOfEach: 1,
				},
				storeCalls: 10,
				recordsMoved: 51,
			},
		},
		'many hits of three tags → the calls of no hit, plus one ancestor read': {
			sourceXml: sixBaysXml,
			search: { term: '1', tagNames: THREE_TAGS },
			expected: {
				hits: 8,
				calls: {
					getRecordsByTagName: 3,
					getRecords: 1,
					getChildrenOfEach: 1,
					findAncestorsOfEach: 1,
				},
				storeCalls: 10,
				recordsMoved: 84,
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const cost = await costOf({ source, search: testCase.search })
			expect(cost).toEqual(testCase.expected)
		},
	})
})
