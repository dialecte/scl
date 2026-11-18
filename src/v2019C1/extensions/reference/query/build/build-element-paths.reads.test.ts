import { buildElementPath, buildElementPaths } from './build-element-path'
import eightLNodesXml from './fixtures/eight-lnodes-with-two-inputs-and-two-outputs.xml?raw'
import mixedXml from './fixtures/element-paths-mixed.xml?raw'
import twelveLNodesXml from './fixtures/twelve-lnodes-named-in-a-private.xml?raw'

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

type Reads = { storeReads: number; recordsMoved: number }

/** The store reads and records moved of `act`. */
async function countReads(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
	act: () => Promise<unknown>
}): Promise<Reads> {
	const { source, act } = params
	source.perf.reset()
	await act()
	const report = source.perf.report()
	return {
		storeReads: STORE_READS.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0),
		recordsMoved: RECORDS_MOVED.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0),
	}
}

/** The eight LNodes of the signals fixture, each followed by its two SourceRefs and its two ControlRefs. */
const EIGHT_LNODES_AND_THEIR_SIGNALS: Scl.Ref<Scl.ElementsOf>[] = Array.from(
	{ length: 8 },
	function lnodeAndSignals(_, index): Scl.Ref<Scl.ElementsOf>[] {
		return [
			{ tagName: 'LNode', id: `ln${index}` },
			{ tagName: 'SourceRef', id: `ln${index}-sr-0` },
			{ tagName: 'SourceRef', id: `ln${index}-sr-1` },
			{ tagName: 'ControlRef', id: `ln${index}-cr-0` },
			{ tagName: 'ControlRef', id: `ln${index}-cr-1` },
		]
	},
).flat()

/** The twelve LNodes of the spec naming fixture. */
const TWELVE_LNODES: Scl.Ref<'LNode'>[] = Array.from({ length: 12 }, function lnodeRef(_, index) {
	return { tagName: 'LNode', id: `ln${index}` }
})

/**
 * One element costs no more than it did when each path walked its own ancestors: the element, one read per
 * ancestor level, the signal siblings, the spec namings; the element is no longer read twice (was `getRecord`, then
 * `findAncestors` of the ref).
 */
describe('buildElementPath - the store reads of one element', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		expected: Reads
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a ControlRef in a Private holding both signal tags → 12 reads, 13 records (was 13, 14)': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			ref: { tagName: 'ControlRef', id: 'cr-1' },
			expected: { storeReads: 12, recordsMoved: 13 },
		},
		'an LNode named in its Private → 7 reads, 7 records (was 8, 8)': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			ref: { tagName: 'LNode', id: 'ln-wrapped' },
			expected: { storeReads: 7, recordsMoved: 7 },
		},
		'a DOI under an LN → 7 reads, 7 records (was 8, 8)': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			ref: { tagName: 'DOI', id: 'doi-1' },
			expected: { storeReads: 7, recordsMoved: 7 },
		},
		'the document root → 1 read, 1 record (as before)': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			ref: { tagName: 'SCL', id: 'scl-1' },
			expected: { storeReads: 1, recordsMoved: 1 },
		},
		'a ref naming nothing → 1 read, no record (as before)': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			ref: { tagName: 'Bay', id: 'missing' },
			expected: { storeReads: 1, recordsMoved: 0 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const reads = await countReads({
				source,
				act: () => buildElementPath(source.query, testCase.ref),
			})
			expect(reads).toEqual(testCase.expected)
		},
	})
})

/**
 * Many elements cost the reads of their deepest path: the elements, one read per ancestor level, the signal siblings,
 * the spec namings, whatever their number; each ancestor moved once.
 */
describe('buildElementPaths - the store reads of many elements', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		expected: Reads
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'eight LNodes and their 32 signals → 9 reads, 139 records (was 424, 456 one by one)': {
			// eight LNodes under one Function, each with two SourceRefs in its inputs and two ControlRefs in its Private's outputs
			sourceXml: eightLNodesXml,
			refs: EIGHT_LNODES_AND_THEIR_SIGNALS,
			expected: { storeReads: 9, recordsMoved: 139 },
		},
		'twelve LNodes named in their Privates → 6 reads, 39 records (was 84, 84 one by one)': {
			// twelve LNodes under one Function, each named in its Private
			sourceXml: twelveLNodesXml,
			refs: TWELVE_LNODES,
			expected: { storeReads: 6, recordsMoved: 39 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const reads = await countReads({
				source,
				act: () => buildElementPaths(source.query, { refs: testCase.refs }),
			})
			expect(reads).toEqual(testCase.expected)
		},
	})
})
