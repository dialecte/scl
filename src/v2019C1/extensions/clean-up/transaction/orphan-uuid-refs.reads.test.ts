import referencesNoneGoneXml from './fixtures/references-none-gone.xml?raw'
import referencesTwoGoneXml from './fixtures/references-two-gone.xml?raw'
import { orphanUuidRefs } from './orphan-uuid-refs'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The lookups by attribute, the tag reads (a store without an attribute index answers a lookup with one) and the
 * records they move, counted by the dev perf counters. */
const COUNTERS = ['getByAttributes', 'getByTagName'].flatMap(function countersOf(read) {
	return [`core::store::${read}`, `core::store::records.${read}`]
})

const GONE = 'a FunctionRef and a SourceRef name nothing: the clean-up handles them'

// F1 (with an LNode), F2 and the EqFunction E1 named by FunctionRefs of one AllocationRole, the LNode by a SourceRef;
// in the second document a FunctionRef and a SourceRef also name nothing.
describe('orphanUuidRefs - the references cleaned', () => {
	const testCases: SclTest.TestCases = {
		// the FunctionRef naming nothing deleted, the SourceRef naming nothing kept without its path and uuid
		'two references naming nothing among four valid → the FunctionRef deleted, the SourceRef cleared, the rest kept':
			{
				sourceXml: referencesTwoGoneXml,
				allowIncoherentReferences: GONE,
				expectedQueries: [
					'//v2019C1:FunctionRef[@functionUuid="f1-uuid"]',
					'//v2019C1:FunctionRef[@functionUuid="f2-uuid"]',
					'//v2019C1:FunctionRef[@functionUuid="e1-uuid"]',
					'//v2019C1:SourceRef[@input="I1"][@sourceLNodeUuid="ln1-uuid"][@source="S1/F1/XCBR1"]',
					'//v2019C1:SourceRef[@input="I2"][not(@sourceLNodeUuid)][not(@source)]',
				],
				unexpectedQueries: ['//v2019C1:FunctionRef[@functionUuid="gone-uuid"]'],
			},
		// nothing to clean
		'every reference naming its target → all kept as they are': {
			sourceXml: referencesNoneGoneXml,
			expectedQueries: [
				'//v2019C1:FunctionRef[@functionUuid="f1-uuid"]',
				'//v2019C1:FunctionRef[@functionUuid="f2-uuid"]',
				'//v2019C1:FunctionRef[@functionUuid="e1-uuid"]',
				'//v2019C1:SourceRef[@sourceLNodeUuid="ln1-uuid"]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			await source.transaction(async function clean(tx) {
				await orphanUuidRefs(tx)
			})
			return { assertOn: 'source' }
		},
	})
})

// The targets of a reference tag are looked up together: per target tag in the order of its pair, the uuids not found
// yet, each in one lookup; a write makes the rest of the tag read again from the transaction, the uuids still missing
// looked up again.
describe('orphanUuidRefs - the lookups', () => {
	type Reads = Record<string, number>
	type TestCase = SclTest.BaseXmlTestCase & { expected: { inMemory: Reads; local: Reads } }

	const testCases: SclTest.TestCases<TestCase> = {
		// FunctionRef: Function finds F1 and F2, SubFunction none, EqFunction E1; SourceRef: LNode finds it. The 29 tag
		// reads are the reference tags, as on main. The local store answers each lookup with a tag read: 33 (main 35)
		'4 references all naming a target → 4 lookups moving 4 records (main 6, 4)': {
			// F1, F2 and E1 named by three FunctionRefs, the LNode of F1 by a SourceRef
			sourceXml: referencesNoneGoneXml,
			expected: {
				inMemory: {
					getByAttributes: 4,
					'records.getByAttributes': 4,
					getByTagName: 29,
					'records.getByTagName': 4,
				},
				local: {
					getByAttributes: 0,
					'records.getByAttributes': 0,
					getByTagName: 33,
					'records.getByTagName': 8,
				},
			},
		},
		// FunctionRef: the four target tags (the last for the uuid naming nothing); its delete looks up nothing more, the
		// uuids left all found; SourceRef: one lookup; the delete hook of the FunctionRef makes 3 lookups, as on main.
		// The local store: 37 tag reads moving 10 records (main 43, 18)
		'6 references, 2 naming nothing → 8 lookups moving 4 records (main 14, 4)': {
			// as above, plus a FunctionRef and a SourceRef naming nothing
			sourceXml: referencesTwoGoneXml,
			allowIncoherentReferences: GONE,
			expected: {
				inMemory: {
					getByAttributes: 8,
					'records.getByAttributes': 4,
					getByTagName: 29,
					'records.getByTagName': 6,
				},
				local: {
					getByAttributes: 0,
					'records.getByAttributes': 0,
					getByTagName: 37,
					'records.getByTagName': 10,
				},
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const counted: { reads: Reads } = { reads: {} }
			await source.transaction(async function clean(tx) {
				source.perf.reset()
				await orphanUuidRefs(tx)
				const report = source.perf.report()
				counted.reads = Object.fromEntries(
					COUNTERS.map(function countOf(name) {
						return [name.replace('core::store::', ''), report[name]?.count ?? 0]
					}),
				)
			})
			const store = typeof window === 'undefined' ? 'inMemory' : 'local'
			expect(counted.reads).toEqual(testCase.expected[store])
		},
	})
})
