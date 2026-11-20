import eightLNodesXml from './fixtures/eight-lnodes-with-two-inputs-and-two-outputs.xml?raw'
import { readSiblingsOfEach, readSignalChildrenOfEach } from './read-siblings-of-each'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE

/** The store calls that read records, counted by the dev perf counters. */
const STORE_READS = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByAttributes',
	'core::store::getByDocumentId',
] as const

/** Two LNodes: `a` with two inputs (and a Private among them) and two outputs in a Private, `b` with one input. */
const TWO_LNODES_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
		<Substation name="S1" ${ID}="sub-1">
			<Function name="F1" ${ID}="f1">
				<LNode lnClass="PTRC" lnInst="1" iedName="None" ${ID}="a">
					<eIEC61850-6-100:LNodeInputs ${ID}="a-inputs">
						<eIEC61850-6-100:SourceRef input="In0" ${ID}="a-sr-0"/>
						<eIEC61850-6-100:SourceRef input="In1" ${ID}="a-sr-1"/>
						<Private type="other" ${ID}="a-inputs-private"/>
					</eIEC61850-6-100:LNodeInputs>
					<Private type="eIEC61850-6-100" ${ID}="a-private">
						<eIEC61850-6-100:LNodeOutputs ${ID}="a-outputs">
							<eIEC61850-6-100:ControlRef output="Out0" ${ID}="a-cr-0"/>
							<eIEC61850-6-100:ControlRef output="Out1" ${ID}="a-cr-1"/>
						</eIEC61850-6-100:LNodeOutputs>
					</Private>
				</LNode>
				<LNode lnClass="PTRC" lnInst="2" iedName="None" ${ID}="b">
					<eIEC61850-6-100:LNodeInputs ${ID}="b-inputs">
						<eIEC61850-6-100:SourceRef input="In0" ${ID}="b-sr-0"/>
					</eIEC61850-6-100:LNodeInputs>
				</LNode>
			</Function>
		</Substation>
	</SCL>`

/** An LNode whose Private holds its signals of both tags together, a SourceRef on either side of a ControlRef. */
const MIXED_PRIVATE_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
		<Substation name="S1" ${ID}="sub-1">
			<Function name="F1" ${ID}="f1">
				<LNode lnClass="PTRC" lnInst="1" iedName="None" ${ID}="a">
					<Private type="eIEC61850-6-100" ${ID}="signals">
						<eIEC61850-6-100:SourceRef input="Trip" inputInst="1" ${ID}="sr1"/>
						<eIEC61850-6-100:ControlRef output="Trip" outputInst="1" ${ID}="cr1"/>
						<eIEC61850-6-100:SourceRef input="Trip" inputInst="2" ${ID}="sr2"/>
					</Private>
				</LNode>
			</Function>
		</Substation>
	</SCL>`

/** The LNodes `ln0` to `ln7` of the fixture, each with two inputs and two outputs. */
const MANY_LNODES = 8

function signalRef(params: { tagName: string; id: string }): Scl.Ref<Scl.ElementsOf> {
	return params as Scl.Ref<Scl.ElementsOf>
}

async function readRawRecords(params: {
	query: Core.Query<Config>
	refs: readonly Scl.Ref<Scl.ElementsOf>[]
}): Promise<Core.AnyRawRecord[]> {
	const records = await params.query.getRecords([...params.refs])
	return records.map((record, index) =>
		record
			? (toRawRecord(record) as Core.AnyRawRecord)
			: ({
					...params.refs[index],
					parent: { tagName: 'LNodeInputs', id: 'gone' },
					attributes: [],
					children: [],
				} as unknown as Core.AnyRawRecord),
	)
}

describe('readSiblingsOfEach', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		signals: { tagName: string; id: string }[]
		/** The ids of each signal's siblings; a signal not stored is read as a record whose parent names no element. */
		expected: string[][]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'signals of two LNodes, both tags → each its parent signal children, in order, itself included':
			{
				sourceXml: TWO_LNODES_XML,
				signals: [
					{ tagName: 'SourceRef', id: 'a-sr-1' },
					{ tagName: 'SourceRef', id: 'b-sr-0' },
					{ tagName: 'ControlRef', id: 'a-cr-0' },
					{ tagName: 'SourceRef', id: 'a-sr-0' },
				],
				expected: [['a-sr-0', 'a-sr-1'], ['b-sr-0'], ['a-cr-0', 'a-cr-1'], ['a-sr-0', 'a-sr-1']],
			},
		'a ControlRef held with SourceRefs by one Private → every signal of the Private, in its order':
			{
				sourceXml: MIXED_PRIVATE_XML,
				signals: [{ tagName: 'ControlRef', id: 'cr1' }],
				expected: [['sr1', 'cr1', 'sr2']],
			},
		'the root, which has no parent → itself alone': {
			sourceXml: TWO_LNODES_XML,
			signals: [{ tagName: 'SCL', id: 'scl-1' }],
			expected: [['scl-1']],
		},
		'a signal whose parent names no element → itself alone': {
			sourceXml: TWO_LNODES_XML,
			signals: [{ tagName: 'SourceRef', id: 'not-stored' }],
			expected: [['not-stored']],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const query = source.query
			const records = await readRawRecords({ query, refs: testCase.signals.map(signalRef) })
			const siblings = await readSiblingsOfEach({ query, records })
			expect(siblings.map((list) => list.map((record) => record.id))).toEqual(testCase.expected)
		},
	})
})

describe('readSignalChildrenOfEach', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		parents: { tagName: string; id: string }[]
		expected: string[][]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'inputs and outputs of two LNodes, a parent that names no element → their signals in order, none for it':
			{
				sourceXml: TWO_LNODES_XML,
				parents: [
					{ tagName: 'LNodeOutputs', id: 'a-outputs' },
					{ tagName: 'LNodeInputs', id: 'b-inputs' },
					{ tagName: 'LNodeInputs', id: 'gone' },
					{ tagName: 'LNodeInputs', id: 'a-inputs' },
				],
				expected: [['a-cr-0', 'a-cr-1'], ['b-sr-0'], [], ['a-sr-0', 'a-sr-1']],
			},
		'one parent named twice among others → its signals at each of its places': {
			sourceXml: TWO_LNODES_XML,
			parents: [
				{ tagName: 'LNodeInputs', id: 'a-inputs' },
				{ tagName: 'LNodeInputs', id: 'b-inputs' },
				{ tagName: 'LNodeInputs', id: 'a-inputs' },
			],
			expected: [['a-sr-0', 'a-sr-1'], ['b-sr-0'], ['a-sr-0', 'a-sr-1']],
		},
		'a Private holding both signal tags → every signal in its order, its other children left out': {
			sourceXml: MIXED_PRIVATE_XML,
			parents: [{ tagName: 'Private', id: 'signals' }],
			expected: [['sr1', 'cr1', 'sr2']],
		},
		'a parent with no signal of its own, one inside its Private → no children, the Private not looked into':
			{
				sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<Function name="F1" ${ID}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="None" ${ID}="a">
								<eIEC61850-6-100:LNodeInputs ${ID}="a-inputs">
									<Private type="other" ${ID}="a-inputs-private">
										<eIEC61850-6-100:SourceRef input="In0" ${ID}="a-wrapped-sr"/>
									</Private>
								</eIEC61850-6-100:LNodeInputs>
							</LNode>
						</Function>
					</Substation>
				</SCL>`,
				parents: [{ tagName: 'LNodeInputs', id: 'a-inputs' }],
				expected: [[]],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const children = await readSignalChildrenOfEach({
				query: source.query,
				parents: testCase.parents.map(signalRef),
			})
			expect(children.map((list) => list.map((record) => record.id))).toEqual(testCase.expected)
		},
	})
})

/** Reading the siblings of many signals costs the store reads of one parent: the parents, then one read per signal tag. */
describe('readSiblingsOfEach - the store reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		signals: { tagName: string; id: string }[]
		expected: { storeReads: number; listed: number }
	}

	const everySignal = Array.from({ length: MANY_LNODES }, (_, index) => [
		{ tagName: 'SourceRef', id: `ln${index}-sr-0` },
		{ tagName: 'SourceRef', id: `ln${index}-sr-1` },
		{ tagName: 'ControlRef', id: `ln${index}-cr-0` },
	]).flat()

	const testCases: SclTest.TestCases<TestCase> = {
		'one SourceRef → 2 store reads (its parent, its parent children)': {
			// eight LNodes, each its LNodeInputs of two SourceRefs and, in a Private, its LNodeOutputs of two ControlRefs
			sourceXml: eightLNodesXml,
			signals: [{ tagName: 'SourceRef', id: 'ln0-sr-0' }],
			expected: { storeReads: 2, listed: 1 },
		},
		[`SourceRefs and ControlRefs of ${MANY_LNODES} LNodes → 3 store reads`]: {
			// eight LNodes, each its LNodeInputs of two SourceRefs and, in a Private, its LNodeOutputs of two ControlRefs
			sourceXml: eightLNodesXml,
			signals: everySignal,
			expected: { storeReads: 3, listed: everySignal.length },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const query = source.query
			const records = await readRawRecords({ query, refs: testCase.signals.map(signalRef) })
			source.perf.reset()
			const siblings = await readSiblingsOfEach({ query, records })
			const report = source.perf.report()
			const storeReads = STORE_READS.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0)
			expect({ storeReads, listed: siblings.filter((list) => list.length > 1).length }).toEqual(
				testCase.expected,
			)
		},
	})
})

/**
 * For each list, the position of the first list that is the same object, and whether it is frozen: what tells a list
 * shared by the signals of one parent (counted once by the naming) from a copy per signal.
 */
function sharingOf(lists: readonly (readonly Core.AnyRawRecord[])[]): {
	sameAs: number[]
	frozen: boolean[]
} {
	return {
		sameAs: lists.map((list) => lists.indexOf(list)),
		frozen: lists.map((list) => Object.isFrozen(list)),
	}
}

/** The signals of one parent share one frozen list; each parent its own; a signal alone its own list, not frozen. */
describe('readSiblingsOfEach - one list per parent', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		signals: { tagName: string; id: string }[]
		expected: { sameAs: number[]; frozen: boolean[] }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'signals of three parents, interleaved → one same frozen list per parent': {
			sourceXml: TWO_LNODES_XML,
			signals: [
				{ tagName: 'SourceRef', id: 'a-sr-0' },
				{ tagName: 'SourceRef', id: 'a-sr-1' },
				{ tagName: 'SourceRef', id: 'b-sr-0' },
				{ tagName: 'ControlRef', id: 'a-cr-0' },
				{ tagName: 'ControlRef', id: 'a-cr-1' },
				{ tagName: 'SourceRef', id: 'a-sr-1' },
			],
			expected: { sameAs: [0, 0, 2, 3, 3, 0], frozen: [true, true, true, true, true, true] },
		},
		'signals of both tags held by one Private → one same frozen list': {
			sourceXml: MIXED_PRIVATE_XML,
			signals: [
				{ tagName: 'SourceRef', id: 'sr1' },
				{ tagName: 'ControlRef', id: 'cr1' },
				{ tagName: 'SourceRef', id: 'sr2' },
			],
			expected: { sameAs: [0, 0, 0], frozen: [true, true, true] },
		},
		'the root and a signal whose parent names no element → each its own list, not frozen': {
			sourceXml: TWO_LNODES_XML,
			signals: [
				{ tagName: 'SCL', id: 'scl-1' },
				{ tagName: 'SourceRef', id: 'not-stored' },
			],
			expected: { sameAs: [0, 1], frozen: [false, false] },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const query = source.query
			const records = await readRawRecords({ query, refs: testCase.signals.map(signalRef) })
			const siblings = await readSiblingsOfEach({ query, records })
			expect(sharingOf(siblings)).toEqual(testCase.expected)
		},
	})
})

/** One parent asked twice in one call answers the same frozen list at both places. */
describe('readSignalChildrenOfEach - one list per parent', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		parents: { tagName: string; id: string }[]
		expected: { sameAs: number[]; frozen: boolean[] }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a parent asked twice among others → the same frozen list at both places, a parent gone its own list':
			{
				sourceXml: TWO_LNODES_XML,
				parents: [
					{ tagName: 'LNodeInputs', id: 'a-inputs' },
					{ tagName: 'LNodeInputs', id: 'b-inputs' },
					{ tagName: 'LNodeInputs', id: 'a-inputs' },
					{ tagName: 'LNodeInputs', id: 'gone' },
				],
				expected: { sameAs: [0, 1, 0, 3], frozen: [true, true, true, false] },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const children = await readSignalChildrenOfEach({
				query: source.query,
				parents: testCase.parents.map(signalRef),
			})
			expect(sharingOf(children)).toEqual(testCase.expected)
		},
	})
})
