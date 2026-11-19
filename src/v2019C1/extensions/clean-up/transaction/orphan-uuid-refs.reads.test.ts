import referencesMixedXml from './fixtures/references-mixed.xml?raw'
import referencesNoneGoneXml from './fixtures/references-none-gone.xml?raw'
import referencesTwoGoneXml from './fixtures/references-two-gone.xml?raw'
import { orphanUuidRefs } from './orphan-uuid-refs'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The lookups by attribute, the tag reads (a store without an attribute index answers a lookup with one) and the
 * records they move, counted by the dev perf counters; `get` and `getMany` are what a reference or target read again
 * after a write costs. */
const COUNTERS = ['get', 'getMany', 'getByAttributes', 'getByTagName'].flatMap(
	function countersOf(read) {
		return [`core::store::${read}`, `core::store::records.${read}`]
	},
)

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = ALL_XMLNS_NAMESPACES

// One FunctionRef naming the one Function.
const ONE_REFERENCE_XML = /* xml */ `
	<SCL ${NS} ${ID}="scl">
		<Header id="T" ${ID}="header"/>
		<Substation name="S1" ${ID}="sub">
			<Function name="F1" uuid="f1-uuid" ${ID}="f1"/>
			<Private type="eIEC61850-6-100" ${ID}="sub-private">
				<eIEC61850-6-100:AllocationRole name="AR1" ${ID}="ar1">
					<eIEC61850-6-100:FunctionRef function="S1/F1" functionUuid="f1-uuid" ${ID}="fref-1"/>
				</eIEC61850-6-100:AllocationRole>
			</Private>
		</Substation>
	</SCL>
`

const MIXED_GONE =
	'a ControlRef pair, a ControlRef and two FunctionRefs name nothing: the clean-up handles them'

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
		// three ControlRefs of one LNode (two pairs on the first, one naming nothing), four FunctionRefs, two of each uuid
		'ControlRefs with two pairs and FunctionRefs sharing uuids → each pair naming nothing cleared, both FunctionRefs naming nothing deleted':
			{
				sourceXml: referencesMixedXml,
				allowIncoherentReferences: MIXED_GONE,
				expectedQueries: [
					'//v2019C1:ControlRef[@output="TripCmd"][@controlledLNodeUuid="lnode-uuid-1"][@controlledDoName="Tr"][not(@resourceUuid)][not(@resourceName)]',
					'//v2019C1:ControlRef[@output="Op"][not(@controlledLNodeUuid)][not(@controlled)][not(@controlledDoName)]',
					'//v2019C1:ControlRef[@output="Cl"][@controlledLNodeUuid="lnode-uuid-1"][@controlledDoName="Cl"]',
					'//v2019C1:FunctionRef[@functionUuid="f1-uuid"][2]',
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
					get: 0,
					'records.get': 0,
					getMany: 0,
					'records.getMany': 0,
					getByAttributes: 4,
					'records.getByAttributes': 4,
					getByTagName: 29,
					'records.getByTagName': 4,
				},
				local: {
					get: 0,
					'records.get': 0,
					getMany: 0,
					'records.getMany': 0,
					getByAttributes: 0,
					'records.getByAttributes': 0,
					getByTagName: 33,
					'records.getByTagName': 8,
				},
			},
		},
		// FunctionRef: the four target tags (the last for the uuid naming nothing); its delete looks up nothing more, the
		// uuids left all found; SourceRef: one lookup; the delete hook of the FunctionRef makes none, as on main.
		// The local store: 34 tag reads moving 10 records (main 40, 18)
		'6 references, 2 naming nothing → 5 lookups moving 4 records (main 11, 4)': {
			// as above, plus a FunctionRef and a SourceRef naming nothing
			sourceXml: referencesTwoGoneXml,
			allowIncoherentReferences: GONE,
			expected: {
				inMemory: {
					get: 0,
					'records.get': 0,
					getMany: 4,
					'records.getMany': 4,
					getByAttributes: 5,
					'records.getByAttributes': 4,
					getByTagName: 29,
					'records.getByTagName': 6,
				},
				local: {
					get: 0,
					'records.get': 0,
					getMany: 4,
					'records.getMany': 4,
					getByAttributes: 0,
					'records.getByAttributes': 0,
					getByTagName: 34,
					'records.getByTagName': 10,
				},
			},
		},
		// n = 1: Function finds it; the local store answers with a tag read: 30 moving 2, as on main
		'1 reference naming its target → 1 lookup moving 1 record, nothing read again (main the same)':
			{
				// one FunctionRef naming the one Function
				sourceXml: ONE_REFERENCE_XML,
				expected: {
					inMemory: {
						get: 0,
						'records.get': 0,
						getMany: 0,
						'records.getMany': 0,
						getByAttributes: 1,
						'records.getByAttributes': 1,
						getByTagName: 29,
						'records.getByTagName': 1,
					},
					local: {
						get: 0,
						'records.get': 0,
						getMany: 0,
						'records.getMany': 0,
						getByAttributes: 0,
						'records.getByAttributes': 0,
						getByTagName: 30,
						'records.getByTagName': 2,
					},
				},
			},
		// the second FunctionRef naming nothing is asked again after the first one's delete; the ControlRef left after a
		// clear reads its LNode again from the transaction (its cache: no store read; the 4 getMany are the delete hooks',
		// as on main). The local store: 40 tag reads moving 13 records (main 43, 17)
		'3 ControlRefs and 4 FunctionRefs, uuids shared, 3 pairs naming nothing → 11 lookups moving 2 records (main 14, 4)':
			{
				// three ControlRefs (two pairs on the first, one naming nothing), four FunctionRefs, two of each uuid
				sourceXml: referencesMixedXml,
				allowIncoherentReferences: MIXED_GONE,
				expected: {
					inMemory: {
						get: 0,
						'records.get': 0,
						getMany: 4,
						'records.getMany': 4,
						getByAttributes: 11,
						'records.getByAttributes': 2,
						getByTagName: 29,
						'records.getByTagName': 7,
					},
					local: {
						get: 0,
						'records.get': 0,
						getMany: 4,
						'records.getMany': 4,
						getByAttributes: 0,
						'records.getByAttributes': 0,
						getByTagName: 40,
						'records.getByTagName': 13,
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

// Staged in the transaction before the clean-up: F1's FunctionRef now names E1, F2 deleted (its FunctionRef goes with
// it), a FunctionRef naming nothing created. The clean-up reads the staged state.
describe('orphanUuidRefs - after staged writes', () => {
	const testCases: SclTest.TestCases = {
		// the two-gone document, written to before the clean-up
		'an update, a delete and a create staged → the staged state cleaned': {
			sourceXml: referencesTwoGoneXml,
			allowIncoherentReferences: GONE,
			expectedQueries: [
				'//v2019C1:FunctionRef[@function="S1/E1"][@functionUuid="e1-uuid"][2]',
				'//v2019C1:SourceRef[@input="I2"][not(@sourceLNodeUuid)][not(@source)]',
			],
			unexpectedQueries: [
				'//v2019C1:FunctionRef[@functionUuid="f1-uuid"]',
				'//v2019C1:FunctionRef[@functionUuid="f2-uuid"]',
				'//v2019C1:FunctionRef[@functionUuid="gone-uuid"]',
				'//v2019C1:FunctionRef[@functionUuid="created-gone-uuid"]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			await source.transaction(async function stageThenClean(tx) {
				await tx.update(
					{ tagName: 'FunctionRef', id: 'fref-1' },
					{ attributes: { function: 'S1/E1', functionUuid: 'e1-uuid' } },
				)
				await tx.delete({ tagName: 'Function', id: 'f2' })
				await tx.addChild(
					{ tagName: 'AllocationRole', id: 'ar1' },
					{
						tagName: 'FunctionRef',
						attributes: { function: 'S1/Gone', functionUuid: 'created-gone-uuid' },
					},
				)
				await orphanUuidRefs(tx)
			})
			return { assertOn: 'source' }
		},
	})
})
