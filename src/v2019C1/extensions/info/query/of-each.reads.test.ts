import twelveSignalsXml from './fixtures/twelve-signals-in-four-lnodes.xml?raw'
import { of } from './of'
import { ofEach } from './of-each'

import { describe, expect } from 'vitest'

import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'
import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { InfoOptions } from './of.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type { AnyRefOrRecord } from '@dialecte/core'

/** The records the store calls move, counted by the dev perf counters. */
const RECORDS_MOVED = [
	'core::store::records.get',
	'core::store::records.getMany',
	'core::store::records.getByTagName',
	'core::store::records.getByAttributes',
	'core::store::records.getByDocumentId',
] as const

/** The twelve signals of the fixture: three SourceRefs in each of three LNodes, three ControlRefs in the fourth. */
const EVERY_SIGNAL = Array.from({ length: 12 }, (_, index) => signalRef(index))

/** The four LNodes of the fixture. */
const EVERY_LNODE = Array.from({ length: 4 }, (_, index): Scl.Ref<'LNode'> => ({
	tagName: 'LNode',
	id: `lnode-${index}`,
}))

function signalRef(index: number): Scl.Ref<'SourceRef' | 'ControlRef'> {
	return { tagName: index < 9 ? 'SourceRef' : 'ControlRef', id: `signal-${index}` }
}

/**
 * The query methods that read a record given as a record without the store (its attributes); left out of the calls.
 */
const RECORD_READERS = new Set(['getAttributes', 'getAttribute'])

/**
 * What one call costs: the query calls made (by name, through the query and its `any`, the record readers left out)
 * and the records moved.
 */
type Cost = { calls: Record<string, number>; recordsMoved: number }

/**
 * The cost of one `ofEach` (or `of` for a single element with `single`) of the elements: given as refs, or as the
 * records a `getRecords` of those refs answers (`asRecords`), read before the counters start.
 */
async function costOf(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
	refs: readonly Scl.Ref<Scl.ElementsOf>[]
	asRecords?: boolean
	single?: boolean
	options?: InfoOptions
}): Promise<Cost> {
	const { source, refs, asRecords = false, single = false, options = {} } = params
	const read = asRecords ? await source.query.getRecords([...refs]) : []
	const elements: AnyRefOrRecord[] = asRecords
		? read.flatMap((record) => (record ? [record] : []))
		: [...refs]
	const counted = countDocumentQueryReads(source.query)
	source.perf.reset()
	if (single) await of(counted.query, elements[0], options)
	else await ofEach(counted.query, elements, options)
	const report = source.perf.report()
	const calls: Record<string, number> = {}
	for (const { method } of counted.calls()) {
		if (!RECORD_READERS.has(method)) calls[method] = (calls[method] ?? 0) + 1
	}
	const recordsMoved = RECORDS_MOVED.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0)
	return { calls, recordsMoved }
}

/**
 * The query calls of one `ofEach` do not follow the number of elements: one `getRecords` of the refs, one of the
 * signals' parents, one `getChildrenOfEach` per signal tag those parents hold.
 */
describe('ofEach - the query calls', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		asRecords?: boolean
		expected: Record<string, number>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'one SourceRef → the SourceRef, its parent, the parent signals': {
			sourceXml: twelveSignalsXml,
			refs: [signalRef(0)],
			expected: { getRecords: 2, getChildrenOfEach: 1 },
		},
		'twelve signals of both tags in four parents → the same 4 calls as two signals': {
			sourceXml: twelveSignalsXml,
			refs: EVERY_SIGNAL,
			expected: { getRecords: 2, getChildrenOfEach: 2 },
		},
		'twelve signals given as records → re-read by ref in one call, then the same reads': {
			sourceXml: twelveSignalsXml,
			refs: EVERY_SIGNAL,
			asRecords: true,
			expected: { getRecords: 2, getChildrenOfEach: 2 },
		},
		'four LNodes given as records, no state → no call': {
			sourceXml: twelveSignalsXml,
			refs: EVERY_LNODE,
			asRecords: true,
			expected: {},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const { calls } = await costOf({
				source,
				refs: testCase.refs,
				asRecords: testCase.asRecords,
			})
			expect(calls).toEqual(testCase.expected)
		},
	})
})

/**
 * The records one `ofEach` moves: the refs, the signals' parents and their signals; a record given is not read again,
 * except a signal (its name comes from its stored parent).
 */
describe('ofEach - the records moved', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		asRecords?: boolean
		options?: InfoOptions
		expected: number
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'one SourceRef → itself, its parent, the three signals of the parent': {
			sourceXml: twelveSignalsXml,
			refs: [signalRef(0)],
			expected: 5,
		},
		'twelve signals in four parents → twelve, four parents, their twelve signals': {
			sourceXml: twelveSignalsXml,
			refs: EVERY_SIGNAL,
			expected: 28,
		},
		'twelve signals given as records → the same as refs': {
			sourceXml: twelveSignalsXml,
			refs: EVERY_SIGNAL,
			asRecords: true,
			expected: 28,
		},
		'four LNodes given as records → none': {
			sourceXml: twelveSignalsXml,
			refs: EVERY_LNODE,
			asRecords: true,
			expected: 0,
		},
		'four LNodes as refs → the four': {
			sourceXml: twelveSignalsXml,
			refs: EVERY_LNODE,
			expected: 4,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const { recordsMoved } = await costOf({
				source,
				refs: testCase.refs,
				asRecords: testCase.asRecords,
				options: testCase.options,
			})
			expect(recordsMoved).toEqual(testCase.expected)
		},
	})
})

/** Three bays with labels, two ApplicationSclRefs titled by their SclFileReference. */
const LABELS_AND_CHILD_TITLES_XML = /* xml */ `
	<SCL xmlns="http://www.iec.ch/61850/2003/SCL" xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100" xmlns:dev="http://dialecte.dev/XML/DEV" dev:db-id="scl-1">
		<Substation name="S1" dev:db-id="sub-1">
			<VoltageLevel name="V1" dev:db-id="vl-1">
				<Bay name="B1" dev:db-id="bay-1">
					<Labels dev:db-id="labels-1">
						<Label lang="en" dev:db-id="label-1-en">Bay one</Label>
						<Label lang="fr" dev:db-id="label-1-fr">Travée un</Label>
					</Labels>
				</Bay>
				<Bay name="B2" dev:db-id="bay-2">
					<Labels dev:db-id="labels-2">
						<Label lang="en" dev:db-id="label-2-en">Bay two</Label>
					</Labels>
				</Bay>
				<Bay name="B3" dev:db-id="bay-3"/>
			</VoltageLevel>
			<eIEC61850-6-100:ApplicationSclRef dev:db-id="asr-1">
				<eIEC61850-6-100:SclFileReference fileUuid="uuid-1" fileType="ICD" version="1" revision="A" dev:db-id="sfr-1"/>
			</eIEC61850-6-100:ApplicationSclRef>
			<eIEC61850-6-100:ApplicationSclRef dev:db-id="asr-2">
				<eIEC61850-6-100:SclFileReference fileUuid="uuid-2" fileType="SSD" version="2" revision="B" dev:db-id="sfr-2"/>
			</eIEC61850-6-100:ApplicationSclRef>
		</Substation>
	</SCL>
`

const EVERY_BAY = [1, 2, 3].map((index): Scl.Ref<'Bay'> => ({ tagName: 'Bay', id: `bay-${index}` }))
const EVERY_APPLICATION_SCL_REF = [1, 2].map((index): Scl.Ref<'ApplicationSclRef'> => ({
	tagName: 'ApplicationSclRef',
	id: `asr-${index}`,
}))

/**
 * The labels and the titles read from a child cost a fixed number of calls for any number of elements, and `of` (one
 * element) moves no more records than `ofEach` of that element.
 */
describe('of and ofEach - labels and titles read from a child', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		asRecords?: boolean
		single?: boolean
		options?: InfoOptions
		expected: Cost
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'of one Bay with labels': {
			sourceXml: LABELS_AND_CHILD_TITLES_XML,
			refs: [EVERY_BAY[0]],
			single: true,
			options: { withLabels: true },
			expected: { calls: { getRecord: 1, getChildrenOfEach: 2 }, recordsMoved: 4 },
		},
		'ofEach of one Bay with labels': {
			sourceXml: LABELS_AND_CHILD_TITLES_XML,
			refs: [EVERY_BAY[0]],
			options: { withLabels: true },
			expected: { calls: { getRecords: 1, getChildrenOfEach: 2 }, recordsMoved: 4 },
		},
		'ofEach of three Bays with labels': {
			sourceXml: LABELS_AND_CHILD_TITLES_XML,
			refs: EVERY_BAY,
			options: { withLabels: true },
			expected: { calls: { getRecords: 1, getChildrenOfEach: 2 }, recordsMoved: 8 },
		},
		'ofEach of three Bays given as records with labels': {
			sourceXml: LABELS_AND_CHILD_TITLES_XML,
			refs: EVERY_BAY,
			asRecords: true,
			options: { withLabels: true },
			expected: { calls: { getRecords: 1, getChildrenOfEach: 2 }, recordsMoved: 8 },
		},
		'of one ApplicationSclRef': {
			sourceXml: LABELS_AND_CHILD_TITLES_XML,
			refs: [EVERY_APPLICATION_SCL_REF[0]],
			single: true,
			expected: { calls: { getRecord: 1, getChildrenOfEach: 1 }, recordsMoved: 2 },
		},
		'ofEach of two ApplicationSclRefs': {
			sourceXml: LABELS_AND_CHILD_TITLES_XML,
			refs: EVERY_APPLICATION_SCL_REF,
			expected: { calls: { getRecords: 1, getChildrenOfEach: 1 }, recordsMoved: 4 },
		},
		'ofEach of two ApplicationSclRefs given as records': {
			sourceXml: LABELS_AND_CHILD_TITLES_XML,
			refs: EVERY_APPLICATION_SCL_REF,
			asRecords: true,
			expected: { calls: { getRecords: 1, getChildrenOfEach: 1 }, recordsMoved: 4 },
		},
		'of one SourceRef': {
			sourceXml: twelveSignalsXml,
			refs: [signalRef(0)],
			single: true,
			expected: { calls: { getRecord: 1, getRecords: 1, getChildrenOfEach: 1 }, recordsMoved: 5 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const cost = await costOf({
				source,
				refs: testCase.refs,
				asRecords: testCase.asRecords,
				single: testCase.single,
				options: testCase.options,
			})
			expect(cost).toEqual(testCase.expected)
		},
	})
})
