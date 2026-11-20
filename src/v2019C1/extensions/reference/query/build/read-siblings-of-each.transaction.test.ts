import { readSiblingsOfEach } from './read-siblings-of-each'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const V2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

/** Two LNodes: `a` with two inputs and two outputs in a Private, `b` with one input. */
const TWO_LNODES_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
		<Substation name="S1" ${ID}="sub-1">
			<Function name="F1" ${ID}="f1">
				<LNode lnClass="PTRC" lnInst="1" iedName="None" ${ID}="a">
					<eIEC61850-6-100:LNodeInputs ${ID}="a-inputs">
						<eIEC61850-6-100:SourceRef input="In0" ${ID}="a-sr-0"/>
						<eIEC61850-6-100:SourceRef input="In1" ${ID}="a-sr-1"/>
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

function signalRef(params: { tagName: string; id: string }): Scl.Ref<Scl.ElementsOf> {
	return params as Scl.Ref<Scl.ElementsOf>
}

/** The signals as the transaction holds them, the ones it no longer holds left out. */
async function readStaged(params: {
	tx: Scl.Transaction
	refs: readonly Scl.Ref<Scl.ElementsOf>[]
}): Promise<Core.AnyRawRecord[]> {
	const read = await params.tx.getRecords([...params.refs])
	return read.flatMap((record) => (record ? [toRawRecord(record) as Core.AnyRawRecord] : []))
}

/** Each signal read as `<id>=<name>`: its name the attribute its tag names it by. */
function namedIds(records: readonly Core.AnyRawRecord[]): string[] {
	return records.map((record) => {
		const name = record.attributes.find(
			(attribute) => attribute.name === 'input' || attribute.name === 'output',
		)
		return `${record.id}=${name?.value ?? ''}`
	})
}

/** Inside a transaction the siblings are the staged signals: a created one listed, a deleted one not, a renamed one as staged. */
describe('readSiblingsOfEach - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** Stages the change, then answers the signals to read and the `<id>=<name>` of each one's siblings. */
		stage: (tx: Scl.Transaction) => Promise<{
			signals: { tagName: string; id: string }[]
			expected: string[][]
		}>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a SourceRef created beside two → listed after them, for each of the three': {
			sourceXml: TWO_LNODES_XML,
			stage: async function createSourceRef(tx) {
				const created = await tx.any.addChild(
					{ tagName: 'LNodeInputs', id: 'a-inputs' },
					{ tagName: 'SourceRef', namespace: V2019C1, attributes: { input: 'In2' } },
				)
				const siblings = ['a-sr-0=In0', 'a-sr-1=In1', `${created.id}=In2`]
				return {
					signals: [
						{ tagName: 'SourceRef', id: 'a-sr-0' },
						{ tagName: 'SourceRef', id: created.id },
						{ tagName: 'SourceRef', id: 'b-sr-0' },
					],
					expected: [siblings, siblings, ['b-sr-0=In0']],
				}
			},
		},
		'a SourceRef deleted → its sibling alone among the signals of its parent': {
			sourceXml: TWO_LNODES_XML,
			stage: async function deleteSourceRef(tx) {
				await tx.delete({ tagName: 'SourceRef', id: 'a-sr-1' })
				return {
					signals: [{ tagName: 'SourceRef', id: 'a-sr-0' }],
					expected: [['a-sr-0=In0']],
				}
			},
		},
		'a ControlRef renamed → read with its staged name by its siblings': {
			sourceXml: TWO_LNODES_XML,
			stage: async function renameControlRef(tx) {
				await tx.update({ tagName: 'ControlRef', id: 'a-cr-1' }, { attributes: { output: 'Out0' } })
				return {
					signals: [
						{ tagName: 'ControlRef', id: 'a-cr-0' },
						{ tagName: 'ControlRef', id: 'a-cr-1' },
					],
					expected: [
						['a-cr-0=Out0', 'a-cr-1=Out0'],
						['a-cr-0=Out0', 'a-cr-1=Out0'],
					],
				}
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const found: { compared?: { siblings: string[][]; expected: string[][] } } = {}
			await source.transaction(async function readSiblingsStaged(tx) {
				const { signals, expected } = await testCase.stage(tx)
				const records = await readStaged({ tx, refs: signals.map(signalRef) })
				const siblings = await readSiblingsOfEach({ query: tx, records })
				found.compared = { siblings: siblings.map(namedIds), expected }
			})
			expect(found.compared).toBeDefined()
			expect(found.compared?.siblings).toEqual(found.compared?.expected)
		},
	})
})

/** The siblings of `a-sr-0` read, the change staged, then read again: the two lists and whether they are one. */
async function readBeforeAndAfter(params: {
	tx: Scl.Transaction
	stage: (tx: Scl.Transaction) => Promise<void>
}): Promise<{ first: string[]; second: string[]; sameList: boolean }> {
	const { tx, stage } = params
	const refs = [signalRef({ tagName: 'SourceRef', id: 'a-sr-0' })]
	const before = await readStaged({ tx, refs })
	const [first] = await readSiblingsOfEach({ query: tx, records: before })
	await stage(tx)
	const after = await readStaged({ tx, refs })
	const [second] = await readSiblingsOfEach({ query: tx, records: after })
	return { first: namedIds(first), second: namedIds(second), sameList: first === second }
}

/** Lists are built per call: a call after a staged change reads the staged signals in a new list, never the earlier one. */
describe('readSiblingsOfEach - a second call inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** Stages a change between the two calls. */
		stage: (tx: Scl.Transaction) => Promise<void>
		expected: { first: string[]; second: string[]; sameList: boolean }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a sibling deleted between two calls → the second call lists it no more, in a new list': {
			sourceXml: TWO_LNODES_XML,
			stage: async function deleteSourceRef(tx) {
				await tx.delete({ tagName: 'SourceRef', id: 'a-sr-1' })
			},
			expected: { first: ['a-sr-0=In0', 'a-sr-1=In1'], second: ['a-sr-0=In0'], sameList: false },
		},
		'a sibling renamed between two calls → the second call reads its staged name, in a new list': {
			sourceXml: TWO_LNODES_XML,
			stage: async function renameSourceRef(tx) {
				await tx.update({ tagName: 'SourceRef', id: 'a-sr-1' }, { attributes: { input: 'In0' } })
			},
			expected: {
				first: ['a-sr-0=In0', 'a-sr-1=In1'],
				second: ['a-sr-0=In0', 'a-sr-1=In0'],
				sameList: false,
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const found: { compared?: TestCase['expected'] } = {}
			await source.transaction(async function readTwice(tx) {
				found.compared = await readBeforeAndAfter({ tx, stage: testCase.stage })
			})
			expect(found.compared).toEqual(testCase.expected)
		},
	})
})
