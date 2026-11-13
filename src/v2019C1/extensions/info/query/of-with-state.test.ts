import { of } from './of'
import { ofEach } from './of-each'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { InfoOptions } from './of.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * An LNode bound by `lnUuid` to a logical node of an IED with an ICD source file, the LNode with a SourceRef and a
 * ControlRef, the logical node with a later-binding ExtRef and ExtCtrl: every tag with a state rule has a state here.
 */
const EVERY_STATE_XML = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="s1">
			<Function name="F1" ${id}="f1">
				<LNode lnClass="PTRC" lnInst="1" iedName="IED1" ldInst="LD0" lnUuid="uuid-ln" ${id}="lnode">
					<eIEC61850-6-100:LNodeInputs ${id}="in">
						<eIEC61850-6-100:SourceRef input="Trip" ${id}="sr"/>
					</eIEC61850-6-100:LNodeInputs>
					<eIEC61850-6-100:LNodeOutputs ${id}="out">
						<eIEC61850-6-100:ControlRef output="Oper" ${id}="cr"/>
					</eIEC61850-6-100:LNodeOutputs>
				</LNode>
			</Function>
		</Substation>
		<IED name="IED1" ${id}="ied1">
			<IEDSourceFiles ${id}="isf">
				<SclFileReference fileType="ICD" ${id}="sfr"/>
			</IEDSourceFiles>
			<AccessPoint name="AP1" ${id}="ap">
				<Server ${id}="srv">
					<Authentication ${id}="auth"/>
					<LDevice inst="LD0" ${id}="ld0">
						<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
						<LN lnClass="PTRC" inst="1" lnType="T1" uuid="uuid-ln" ${id}="ln">
							<Inputs ${id}="inputs"><ExtRef intAddr="Pos" pDO="Pos" ${id}="ext-ref"/></Inputs>
							<Outputs ${id}="outputs"><ExtCtrl intAddr="Pos" pDO="Pos" ${id}="ext-ctrl"/></Outputs>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

const LNODE = { tagName: 'LNode', id: 'lnode' } as const
const SOURCE_REF = { tagName: 'SourceRef', id: 'sr' } as const
const CONTROL_REF = { tagName: 'ControlRef', id: 'cr' } as const
const EXT_REF = { tagName: 'ExtRef', id: 'ext-ref' } as const
const EXT_CTRL = { tagName: 'ExtCtrl', id: 'ext-ctrl' } as const

/** The state is computed only when asked: without `withState: true` the info carries its title and no `state` key. */
describe('of - the state only when asked', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		options?: InfoOptions
		expected: { title: string; labels?: Record<string, Record<string, string>> }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'LNode, no options → its title, no state': {
			sourceXml: EVERY_STATE_XML,
			ref: LNODE,
			expected: { title: 'PTRC1' },
		},
		'LNode, withState false → its title, no state': {
			sourceXml: EVERY_STATE_XML,
			ref: LNODE,
			options: { withState: false },
			expected: { title: 'PTRC1' },
		},
		'LNode, full mode and labels asked, no withState → no state': {
			sourceXml: EVERY_STATE_XML,
			ref: LNODE,
			options: { mode: 'full', withLabels: true },
			expected: { title: 'IED1/LD0/PTRC1', labels: {} },
		},
		'SourceRef, no options → its title, no state': {
			sourceXml: EVERY_STATE_XML,
			ref: SOURCE_REF,
			expected: { title: 'Trip' },
		},
		'ControlRef, no options → its title, no state': {
			sourceXml: EVERY_STATE_XML,
			ref: CONTROL_REF,
			expected: { title: 'Oper' },
		},
		'ExtRef in its later-binding shape, no options → its title, no state': {
			sourceXml: EVERY_STATE_XML,
			ref: EXT_REF,
			expected: { title: 'ExtRef' },
		},
		'ExtCtrl in its later-binding shape, no options → its title, no state': {
			sourceXml: EVERY_STATE_XML,
			ref: EXT_CTRL,
			expected: { title: 'ExtCtrl' },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const info = await of(source.query, testCase.ref, testCase.options)
			// strict: a `state` key holding undefined is a state key still
			expect(info).toStrictEqual(testCase.expected)
		},
	})
})

describe('ofEach - the state only when asked', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		options?: InfoOptions
		expected: { title: string }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode, its signals and the ExtRef and ExtCtrl of its logical node, no options → their titles, no state':
			{
				sourceXml: EVERY_STATE_XML,
				refs: [LNODE, SOURCE_REF, CONTROL_REF, EXT_REF, EXT_CTRL],
				expected: [
					{ title: 'PTRC1' },
					{ title: 'Trip' },
					{ title: 'Oper' },
					{ title: 'ExtRef' },
					{ title: 'ExtCtrl' },
				],
			},
		'an LNode, withState false → its title, no state': {
			sourceXml: EVERY_STATE_XML,
			refs: [LNODE],
			options: { withState: false },
			expected: [{ title: 'PTRC1' }],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const infos = await ofEach(source.query, testCase.refs, testCase.options)
			expect(infos).toStrictEqual(testCase.expected)
		},
	})
})

/**
 * Without its state, an LNode's info is read from the LNode alone: no read of the document's IEDs or logical nodes,
 * however the LNode is bound.
 */
describe('of and ofEach without the state - the store reads', () => {
	/** The store reads of the call; `get` is left out where the case does not pin it. */
	type StoreReads = { get?: number; getByTagName: number; getByDocumentId: number }
	type TestCase = SclTest.BaseXmlTestCase & {
		describe: (query: Scl.Query) => Promise<unknown>
		expected: StoreReads
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'of(LNode) bound to a logical node of a real IED → one get, no read by tag or of the whole document':
			{
				sourceXml: EVERY_STATE_XML,
				describe: (query) => of(query, LNODE),
				expected: { get: 1, getByTagName: 0, getByDocumentId: 0 },
			},
		'ofEach of that LNode → no read by tag or of the whole document': {
			sourceXml: EVERY_STATE_XML,
			describe: (query) => ofEach(query, [LNODE]),
			expected: { getByTagName: 0, getByDocumentId: 0 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const query = source.query
			source.perf.reset()
			await testCase.describe(query)
			const report = source.perf.report()
			const reads: StoreReads = {
				getByTagName: report['core::store::getByTagName']?.count ?? 0,
				getByDocumentId: report['core::store::getByDocumentId']?.count ?? 0,
			}
			if (testCase.expected.get !== undefined) reads.get = report['core::store::get']?.count ?? 0
			expect(reads).toEqual(testCase.expected)
		},
	})
})
