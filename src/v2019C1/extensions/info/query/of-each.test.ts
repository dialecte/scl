import { ofEach } from './of-each'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type { AnyRefOrRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('ofEach', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		expected: { title: string; state?: unknown }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode and its SourceRef → their infos, in the order given': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="IED1" ldInst="LD0" ${id}="lnode">
								<eIEC61850-6-100:LNodeInputs ${id}="in">
									<eIEC61850-6-100:SourceRef input="Trip" ${id}="sr"/>
								</eIEC61850-6-100:LNodeInputs>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			refs: [
				{ tagName: 'SourceRef', id: 'sr' },
				{ tagName: 'LNode', id: 'lnode' },
			],
			expected: [
				{ title: 'Trip', state: { binding: 'open', implemented: false } },
				{ title: 'PTRC1', state: { locked: true, mapping: 'unmapped' } },
			],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const infos = await ofEach(source.query, testCase.refs, { withState: true })
			expect(infos.map(({ title, state }) => ({ title, state }))).toEqual(testCase.expected)
		},
	})
})

describe('ofEach - reads its elements in one batch and each signal parent once', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		/** Calls made on the query by the one `ofEach` call. */
		expectedCalls: { getRecord: number; getRecords: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'elements without signals → one getRecords, no getRecord': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1"/>
					</Substation>
				</SCL>
			`,
			refs: [
				{ tagName: 'Substation', id: 's1' },
				{ tagName: 'Function', id: 'f1' },
			],
			expectedCalls: { getRecord: 0, getRecords: 1 },
		},
		'three signals under one parent → the parent and its children read once': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="lnode">
								<eIEC61850-6-100:LNodeInputs ${id}="in">
									<eIEC61850-6-100:SourceRef input="Trip" inputInst="1" ${id}="sr1"/>
									<eIEC61850-6-100:SourceRef input="Trip" inputInst="2" ${id}="sr2"/>
									<eIEC61850-6-100:SourceRef input="Close" inputInst="1" ${id}="sr3"/>
								</eIEC61850-6-100:LNodeInputs>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			refs: [
				{ tagName: 'SourceRef', id: 'sr1' },
				{ tagName: 'SourceRef', id: 'sr2' },
				{ tagName: 'SourceRef', id: 'sr3' },
			],
			expectedCalls: { getRecord: 1, getRecords: 2 },
		},
		'signals under two parents → each parent and its children read once': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="lnode-a">
								<eIEC61850-6-100:LNodeInputs ${id}="in-a">
									<eIEC61850-6-100:SourceRef input="Trip" inputInst="1" ${id}="sr-a1"/>
									<eIEC61850-6-100:SourceRef input="Trip" inputInst="2" ${id}="sr-a2"/>
								</eIEC61850-6-100:LNodeInputs>
							</LNode>
							<LNode lnClass="XCBR" lnInst="1" iedName="None" ${id}="lnode-b">
								<eIEC61850-6-100:LNodeInputs ${id}="in-b">
									<eIEC61850-6-100:SourceRef input="Open" inputInst="1" ${id}="sr-b1"/>
									<eIEC61850-6-100:SourceRef input="Close" inputInst="1" ${id}="sr-b2"/>
								</eIEC61850-6-100:LNodeInputs>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			refs: [
				{ tagName: 'SourceRef', id: 'sr-a1' },
				{ tagName: 'SourceRef', id: 'sr-b1' },
				{ tagName: 'SourceRef', id: 'sr-a2' },
				{ tagName: 'SourceRef', id: 'sr-b2' },
			],
			expectedCalls: { getRecord: 2, getRecords: 3 },
		},
		'inputs and outputs of one LNode → each parent read once': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="CSWI" lnInst="1" iedName="None" ${id}="lnode">
								<eIEC61850-6-100:LNodeInputs ${id}="in">
									<eIEC61850-6-100:SourceRef input="Pos" inputInst="1" ${id}="sr1"/>
									<eIEC61850-6-100:SourceRef input="Pos" inputInst="2" ${id}="sr2"/>
								</eIEC61850-6-100:LNodeInputs>
								<eIEC61850-6-100:LNodeOutputs ${id}="out">
									<eIEC61850-6-100:ControlRef output="Open" outputInst="1" ${id}="cr1"/>
									<eIEC61850-6-100:ControlRef output="Close" outputInst="1" ${id}="cr2"/>
								</eIEC61850-6-100:LNodeOutputs>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			refs: [
				{ tagName: 'SourceRef', id: 'sr1' },
				{ tagName: 'ControlRef', id: 'cr1' },
				{ tagName: 'SourceRef', id: 'sr2' },
				{ tagName: 'ControlRef', id: 'cr2' },
			],
			expectedCalls: { getRecord: 2, getRecords: 3 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const { query, reads } = countQueryReads(source.query)
			await ofEach(query, testCase.refs, { withState: true })
			expect({
				getRecord: reads.filter((method) => method === 'getRecord').length,
				getRecords: reads.filter((method) => method === 'getRecords').length,
			}).toEqual(testCase.expectedCalls)
		},
	})
})

describe('ofEach - each element described as stored, in the order given', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		elements: AnyRefOrRecord[]
		expected: { title: string; state?: unknown }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'signals sharing an input → named among their siblings': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="lnode">
								<eIEC61850-6-100:LNodeInputs ${id}="in">
									<eIEC61850-6-100:SourceRef input="Trip" inputInst="1" ${id}="sr1"/>
									<eIEC61850-6-100:SourceRef input="Trip" inputInst="2" ${id}="sr2"/>
									<eIEC61850-6-100:SourceRef input="Close" inputInst="1" ${id}="sr3"/>
								</eIEC61850-6-100:LNodeInputs>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			elements: [
				{ tagName: 'SourceRef', id: 'sr2' },
				{ tagName: 'SourceRef', id: 'sr3' },
				{ tagName: 'SourceRef', id: 'sr1' },
			],
			expected: [
				{ title: 'Trip(2)', state: { binding: 'open', implemented: false } },
				{ title: 'Close', state: { binding: 'open', implemented: false } },
				{ title: 'Trip(1)', state: { binding: 'open', implemented: false } },
			],
		},
		'a signal handed over with a lifted parent → named among its stored siblings': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="lnode">
								<eIEC61850-6-100:LNodeInputs ${id}="in">
									<eIEC61850-6-100:SourceRef input="Trip" inputInst="1" ${id}="sr1"/>
									<eIEC61850-6-100:SourceRef input="Trip" inputInst="2" ${id}="sr2"/>
								</eIEC61850-6-100:LNodeInputs>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			elements: [
				{
					tagName: 'SourceRef',
					id: 'sr2',
					namespace: { prefix: 'eIEC61850-6-100', uri: 'http://www.iec.ch/61850/2019/SCL/6-100' },
					attributes: [],
					value: '',
					parent: { tagName: 'LNode', id: 'lnode' },
					children: [],
				},
			],
			expected: [{ title: 'Trip(2)', state: { binding: 'open', implemented: false } }],
		},
		'a control signal under the outputs → named among its siblings': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="CSWI" lnInst="1" iedName="None" ${id}="lnode">
								<eIEC61850-6-100:LNodeOutputs ${id}="out">
									<eIEC61850-6-100:ControlRef output="Open" outputInst="1" ${id}="cr1"/>
									<eIEC61850-6-100:ControlRef output="Close" outputInst="1" ${id}="cr2"/>
								</eIEC61850-6-100:LNodeOutputs>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			elements: [{ tagName: 'ControlRef', id: 'cr2' }],
			expected: [{ title: 'Close', state: { binding: 'open', implemented: false } }],
		},
		'a ref without id → the element of that tag': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Header id="doc" ${id}="hdr"/>
					<Substation name="S1" ${id}="s1"/>
				</SCL>
			`,
			elements: [{ tagName: 'Header' }, { tagName: 'Substation', id: 's1' }],
			expected: [{ title: 'Header' }, { title: 'S1' }],
		},
		'a missing element → an empty title, the others described': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1"/>
				</SCL>
			`,
			elements: [
				{ tagName: 'Substation', id: 'missing' },
				{ tagName: 'Substation', id: 's1' },
			],
			expected: [{ title: '' }, { title: 'S1' }],
		},
		'an element given twice → described at each position': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1"/>
				</SCL>
			`,
			elements: [
				{ tagName: 'Substation', id: 's1' },
				{ tagName: 'Substation', id: 's1' },
			],
			expected: [{ title: 'S1' }, { title: 'S1' }],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const infos = await ofEach(source.query, testCase.elements, { withState: true })
			expect(infos).toEqual(testCase.expected)
		},
	})
})
