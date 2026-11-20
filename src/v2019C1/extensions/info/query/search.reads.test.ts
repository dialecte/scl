import '@dialecte/core/sqlite'
import sixBaysXml from './fixtures/six-bays-with-signals.xml?raw'
import { search } from './search'

import { createTestProject } from '@dialecte/core/test'
import { describe, expect, it } from 'vitest'

import { SCL_DIALECTE } from '@/v2019C1/declaration.constants'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SearchParams } from './search.types'
import type { Scl } from '@/v2019C1/config'

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

/** The stores the reads are pinned on, each named explicitly (the runner's default store is one of them). */
const STORES = ['inMemory', 'sqlite'] as const

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

/** One search on a fresh project of the six-bay fixture, on the store named, counted from the search's first read. */
async function costOf(params: {
	store: (typeof STORES)[number]
	search: SearchParams
}): Promise<Cost> {
	const opened = await createTestProject({
		dialecte: SCL_DIALECTE,
		sourceXml: sixBaysXml,
		storage: { type: params.store },
		dev: { perf: true },
	})
	const document = opened.source.document
	const counted = countDocumentQueryReads(document.query)
	document.perf.reset()
	const hits = await search(counted.query, params.search)
	const report = document.perf.report()
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
	type Case = { name: string; search: SearchParams; expected: Cost }

	const cases: Case[] = [
		{
			name: 'an empty term → no read',
			search: { term: ' ', tagNames: THREE_TAGS },
			expected: { hits: 0, calls: {}, storeCalls: 0, recordsMoved: 0 },
		},
		{
			name: 'a limit of 0 → no read',
			search: { term: 'in', tagNames: THREE_TAGS, limit: 0 },
			expected: { hits: 0, calls: {}, storeCalls: 0, recordsMoved: 0 },
		},
		{
			name: 'no hit over three tags → the tags and the describer, no ancestor read',
			search: { term: 'busbar', tagNames: THREE_TAGS },
			expected: {
				hits: 0,
				calls: { getRecordsByTagName: 3, getRecords: 1, getChildrenOfEach: 1 },
				storeCalls: 5,
				recordsMoved: 56,
			},
		},
		{
			name: 'one Bay of one tag → one tag read, no describer read, one ancestor read per level',
			search: { term: 'bay4', tagNames: ['Bay'] },
			expected: {
				hits: 1,
				calls: { getRecordsByTagName: 1, findAncestorsOfEach: 1 },
				storeCalls: 4,
				recordsMoved: 9,
			},
		},
		{
			name: 'one SourceRef → the tag, the describer, the ancestors',
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
		{
			name: 'six SourceRefs at the same depth → the same calls as one',
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
		{
			name: 'a tag given twice → read once',
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
		{
			name: 'many hits of three tags → the calls of no hit, plus one ancestor read',
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
	]

	for (const store of STORES) {
		for (const { name, search: params, expected } of cases) {
			it(`${store}: ${name}`, async () => {
				const cost = await costOf({ store, search: params })
				expect(cost).toEqual(expected)
			})
		}
	}
})
