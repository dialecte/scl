/// <reference types="vite/client" />
import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { followTupleTargetRename } from '@/v2019C1/hooks/shared/tuple-reference-rename'
import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

const subscription = FIXTURES['./fixtures/one-subscription-by-uuid-and-by-names.xml']
const sixSubscriptionsToEach = FIXTURES['./fixtures/six-subscriptions-to-each-of-two-ieds.xml']

/** The records the store calls move, counted by the dev perf counters. */
const RECORDS_MOVED = [
	'core::store::records.get',
	'core::store::records.getMany',
	'core::store::records.getByTagName',
	'core::store::records.getByAttributes',
	'core::store::records.getByDocumentId',
] as const

/** The query methods that read a record given as a record without the store (its attributes); left out of the calls. */
const RECORD_READERS = new Set(['getAttributes', 'getAttribute'])

/** A rename: the element and the attributes it writes. */
type Rename = { tagName: 'IED' | 'LDevice'; id: string; attributes: Record<string, string> }

/** What a rename's reads cost: the query calls by name and the records the store moved. */
type Cost = { calls: Record<string, number>; recordsMoved: number }

/**
 * The tuple references of a rename are found by lookups: no whole read of a referrer tag, but of `IEDName`, which
 * names its IED by its text (no attribute to look up).
 */
describe('a rename finds its tuple references by lookups', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		rename: Rename
		expected: { tagReads: string[]; lookups: string[] }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'P2 renamed -> one lookup per referrer tag and uuid attribute, the IED names looked up, IEDName read whole':
			{
				sourceXml: subscription,
				rename: { tagName: 'IED', id: 'p2', attributes: { name: 'P9' } },
				expected: {
					tagReads: ['IEDName'],
					lookups: [
						'IED name',
						'LNodeSpecNaming sIedName',
						'Association iedName',
						'ClientLN iedName',
						'ConnectedAP iedName',
						'ExtCtrl iedName',
						'ExtRef iedName',
						'LNode iedName',
						'KDC iedName',
						'Association lnUuid',
						'ClientLN lnUuid',
						'ConnectedAP apUuid',
						'ExtCtrl lnUuid',
						'ExtRef lnUuid',
						'ExtRef srcCBUuid',
						'FCDA lnUuid',
						'GSE cbUuid',
						'IEDName apUuid',
						'IEDName ldUuid',
						'IEDName lnUuid',
						'LNode lnUuid',
						'KDC apUuid',
						'ServerAt apUuid',
					],
				},
			},
		'P2 logical device renamed -> one lookup per referrer tag and uuid attribute, no tag read': {
			sourceXml: subscription,
			rename: { tagName: 'LDevice', id: 'p2-ld', attributes: { inst: 'LD5' } },
			expected: {
				tagReads: [],
				lookups: [
					'Association lnUuid',
					'ClientLN lnUuid',
					'ExtCtrl lnUuid',
					'ExtRef lnUuid',
					'ExtRef srcCBUuid',
					'FCDA lnUuid',
					'GSE cbUuid',
					'IEDName ldUuid',
					'IEDName lnUuid',
					'LNode lnUuid',
				],
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const { tagReads, lookups } = await costOfRename({ source, rename: testCase.rename })
			expect({ tagReads, lookups }).toEqual(testCase.expected)
		},
	})
})

/**
 * The node project runs on the in-memory store, the browser projects on the local store (IndexedDB): a page has a
 * `window`, a node test process none.
 */
const ON_INDEXED_STORE = typeof window === 'undefined'

/**
 * The records a rename's reads move, and its query calls by name, at one referrer per tag and at many, against main
 * (`main`, measured on cf625eee). A whole-tag read becomes one lookup per uuid attribute, so the calls grow by the uuid
 * attributes a tag has beyond its first. On a store indexing attributes (in-memory here; SQLite, measured on GOOIK
 * apart) the records moved are exact and never above main, far fewer for many referrers. IndexedDB indexes none: each
 * lookup reads its tag whole, so it moves at most main plus one read of the tag per uuid attribute beyond the first
 * (`unindexed`, each extra read named); the answers are the same on every store.
 */
describe('a rename moves the records of its referrers only', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		rename: Rename
		main: Cost
		expected: Cost
		/** The records moved on IndexedDB, and the tag reads it makes beyond main's. */
		unindexed: { recordsMoved: number; extraTagReads: string }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'P2 renamed, one referrer per tag -> no more records than main': {
			sourceXml: subscription,
			rename: { tagName: 'IED', id: 'p2', attributes: { name: 'P9' } },
			unindexed: {
				recordsMoved: 32,
				extraTagReads: 'ExtRef once (2 records), IEDName twice (1 record each)',
			},
			main: {
				calls: {
					getRecordsByTagName: 21,
					getRecord: 1,
					getDocumentInfo: 1,
					getChildren: 1,
					getTree: 1,
					findAncestors: 1,
				},
				recordsMoved: 28,
			},
			expected: {
				calls: {
					findByAttributes: 23,
					getRecord: 1,
					getDocumentInfo: 1,
					getChildren: 1,
					getRecordsByTagName: 1,
					getTree: 1,
					findAncestors: 1,
				},
				recordsMoved: 26,
			},
		},
		'P2 logical device renamed, one referrer per tag -> no more records than main': {
			sourceXml: subscription,
			rename: { tagName: 'LDevice', id: 'p2-ld', attributes: { inst: 'LD5' } },
			unindexed: {
				recordsMoved: 20,
				extraTagReads: 'ExtRef once (2 records), IEDName once (1 record)',
			},
			main: { calls: { getRecordsByTagName: 8, getTree: 1, findAncestors: 1 }, recordsMoved: 17 },
			expected: { calls: { findByAttributes: 10, getTree: 1, findAncestors: 1 }, recordsMoved: 16 },
		},
		'P2 renamed, six referrers among twelve per tag -> its referrers only': {
			sourceXml: sixSubscriptionsToEach,
			rename: { tagName: 'IED', id: 'p2', attributes: { name: 'P9' } },
			unindexed: {
				recordsMoved: 82,
				extraTagReads: 'none: no tag holding records is looked up by two uuid attributes',
			},
			main: {
				calls: {
					getRecordsByTagName: 20,
					getRecord: 1,
					getDocumentInfo: 1,
					getChildren: 1,
					getTree: 1,
					findAncestors: 1,
				},
				recordsMoved: 82,
			},
			expected: {
				calls: {
					findByAttributes: 21,
					getRecord: 1,
					getDocumentInfo: 1,
					getChildren: 1,
					getRecordsByTagName: 1,
					getTree: 1,
					findAncestors: 1,
				},
				recordsMoved: 48,
			},
		},
		'P2 logical device renamed, six referrers among twelve per tag -> its referrers only': {
			sourceXml: sixSubscriptionsToEach,
			rename: { tagName: 'LDevice', id: 'p2-ld', attributes: { inst: 'LD5' } },
			unindexed: {
				recordsMoved: 37,
				extraTagReads: 'none: no tag holding records is looked up by two uuid attributes',
			},
			main: { calls: { getRecordsByTagName: 7, getTree: 1, findAncestors: 1 }, recordsMoved: 37 },
			expected: { calls: { findByAttributes: 8, getTree: 1, findAncestors: 1 }, recordsMoved: 25 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const { calls, recordsMoved } = await costOfRename({ source, rename: testCase.rename })
			expect(calls).toEqual(testCase.expected.calls)
			expect(recordsMoved).toBe(
				ON_INDEXED_STORE ? testCase.expected.recordsMoved : testCase.unindexed.recordsMoved,
			)
			if (ON_INDEXED_STORE) expect(recordsMoved).toBeLessThanOrEqual(testCase.main.recordsMoved)
		},
	})
})

/**
 * The reads of the tuple rename of `rename`, on the document (no referrer written yet, the operations not looked at):
 * the tags read whole, the lookups (tag and attributes), the query calls by name and the records the store moved.
 */
async function costOfRename(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
	rename: Rename
}): Promise<Cost & { tagReads: string[]; lookups: string[] }> {
	const { source, rename } = params
	const ref = { tagName: rename.tagName, id: rename.id } as Scl.Ref<Scl.ElementsOf>
	const stored = await source.query.getRecord(ref)
	if (!stored) throw new Error(`no ${ref.tagName} ${ref.id} in the fixture`)
	const oldRecord = toRawRecord(stored) as Scl.RawRecord<Scl.ElementsOf>
	const newRecord: Scl.RawRecord<Scl.ElementsOf> = {
		...oldRecord,
		attributes: oldRecord.attributes.map((attribute) =>
			attribute.name in rename.attributes
				? { ...attribute, value: rename.attributes[attribute.name] }
				: attribute,
		),
	}
	const { query, calls } = countDocumentQueryReads(source.query)
	source.perf.reset()
	await followTupleTargetRename(query, { oldRecord, newRecord })
	const report = source.perf.report()
	const tagReads = calls().flatMap((call) =>
		call.method === 'getRecordsByTagName' ? [String(call.args[0])] : [],
	)
	const lookups = calls().flatMap((call) =>
		call.method === 'findByAttributes' ? [describeLookup(call.args[0])] : [],
	)
	const byMethod: Record<string, number> = {}
	for (const { method } of calls()) {
		if (!RECORD_READERS.has(method)) byMethod[method] = (byMethod[method] ?? 0) + 1
	}
	const recordsMoved = RECORDS_MOVED.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0)
	return { tagReads, lookups, calls: byMethod, recordsMoved }
}

function describeLookup(filter: unknown): string {
	const { tagName, attributes } = filter as { tagName: string; attributes: Record<string, unknown> }
	return `${tagName} ${Object.keys(attributes).join(',')}`
}
