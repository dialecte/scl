import { ofEach } from './of-each'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { InfoOptions } from './of.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const V2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

/**
 * An LNode bound to a logical node of a specification IED, its inputs and outputs held by one Private, a Bay with
 * labels, an ApplicationSclRef titled by its SclFileReference: every kind of read `ofEach` makes beyond the elements.
 */
const EVERY_READ_XML = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="s1">
			<VoltageLevel name="V1" ${id}="vl1">
				<Bay name="B1" ${id}="bay1">
					<Labels ${id}="labels1">
						<Label lang="EN" ${id}="label-en">Bay one</Label>
						<Label lang="fr" id="short" ${id}="label-fr">T1</Label>
					</Labels>
					<Function name="F1" ${id}="f1">
						<LNode lnClass="PTRC" lnInst="1" iedName="IED1" ldInst="LD0" ${id}="lnode">
							<Private type="eIEC61850-6-100" ${id}="signals">
								<eIEC61850-6-100:SourceRef input="Trip" inputInst="1" ${id}="sr1"/>
								<eIEC61850-6-100:ControlRef output="Trip" outputInst="1" ${id}="cr1"/>
								<eIEC61850-6-100:ControlRef output="Trip" outputInst="2" ${id}="cr2"/>
							</Private>
							<eIEC61850-6-100:LNodeInputs ${id}="in">
								<eIEC61850-6-100:SourceRef input="Pos" inputInst="1" ${id}="sr2"/>
								<eIEC61850-6-100:SourceRef input="Pos" inputInst="2" ${id}="sr3"/>
							</eIEC61850-6-100:LNodeInputs>
						</LNode>
						<LNode lnClass="XCBR" lnInst="1" iedName="None" ${id}="lnode-free"/>
					</Function>
				</Bay>
			</VoltageLevel>
			<eIEC61850-6-100:ApplicationSclRef ${id}="asr">
				<eIEC61850-6-100:SclFileReference fileUuid="uuid-1" fileType="ICD" version="1" revision="A" ${id}="sfr"/>
			</eIEC61850-6-100:ApplicationSclRef>
		</Substation>
		<IED name="IED1" ${id}="ied1">
			<AccessPoint name="AP1" ${id}="ap">
				<Server ${id}="srv">
					<Authentication ${id}="auth"/>
					<LDevice inst="LD0" ${id}="ld0">
						<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
						<LN lnClass="PTRC" inst="1" lnType="T1" ${id}="ln"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

/** Every element of EVERY_READ_XML with a title of interest, in an order mixing tags and parents. */
const EVERY_READ_ELEMENTS: Scl.Ref<Scl.ElementsOf>[] = [
	{ tagName: 'ControlRef', id: 'cr2' },
	{ tagName: 'Bay', id: 'bay1' },
	{ tagName: 'SourceRef', id: 'sr3' },
	{ tagName: 'LNode', id: 'lnode' },
	{ tagName: 'SourceRef', id: 'sr1' },
	{ tagName: 'ApplicationSclRef', id: 'asr' },
	{ tagName: 'ControlRef', id: 'cr1' },
	{ tagName: 'LNode', id: 'lnode-free' },
	{ tagName: 'SourceRef', id: 'sr2' },
	{ tagName: 'Substation', id: 's1' },
	{ tagName: 'SourceRef', id: 'sr1' },
]

/** The same elements given as refs, tracked records or raw records → the same infos, whatever is asked. */
describe('ofEach - records matching the store and refs described alike', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** How the elements are handed over: as refs, as the records the store answers, or those records raw. */
		given: 'refs' | 'records' | 'raw records'
		options: InfoOptions
		expected: { title: string; state?: unknown; labels?: unknown }[]
	}

	const BAY_LABELS = { en: { '': 'Bay one' }, fr: { short: 'T1' } }
	const OPEN = { binding: 'open', implemented: false }
	const TITLES = [
		{ title: 'Trip(2)' },
		{ title: 'B1' },
		{ title: 'Pos(2)' },
		{ title: 'PTRC1' },
		{ title: 'Trip' },
		{ title: 'ICD v1.A' },
		{ title: 'Trip(1)' },
		{ title: 'XCBR1' },
		{ title: 'Pos(1)' },
		{ title: 'S1' },
		{ title: 'Trip' },
	]
	const FULL = [
		{ title: 'Trip(2)', state: OPEN, labels: {} },
		{ title: 'B1', labels: BAY_LABELS },
		{ title: 'Pos(2)', state: OPEN, labels: {} },
		{ title: 'IED1/LD0/PTRC1', state: { locked: true, mapping: 'specification-ied' }, labels: {} },
		{ title: 'Trip', state: OPEN, labels: {} },
		{ title: 'uuid-1/ICD v1.A', labels: {} },
		{ title: 'Trip(1)', state: OPEN, labels: {} },
		{ title: 'None/XCBR1', state: { locked: false, mapping: 'unmapped' }, labels: {} },
		{ title: 'Pos(1)', state: OPEN, labels: {} },
		{ title: 'S1', labels: {} },
		{ title: 'Trip', state: OPEN, labels: {} },
	]
	const FULL_OPTIONS: InfoOptions = { mode: 'full', withState: true, withLabels: true }
	const testCases: SclTest.TestCases<TestCase> = {
		'refs, titles only': {
			sourceXml: EVERY_READ_XML,
			given: 'refs',
			options: {},
			expected: TITLES,
		},
		'records, titles only': {
			sourceXml: EVERY_READ_XML,
			given: 'records',
			options: {},
			expected: TITLES,
		},
		'raw records, titles only': {
			sourceXml: EVERY_READ_XML,
			given: 'raw records',
			options: {},
			expected: TITLES,
		},
		'refs, full titles, states and labels': {
			sourceXml: EVERY_READ_XML,
			given: 'refs',
			options: FULL_OPTIONS,
			expected: FULL,
		},
		'records, full titles, states and labels': {
			sourceXml: EVERY_READ_XML,
			given: 'records',
			options: FULL_OPTIONS,
			expected: FULL,
		},
		'raw records, full titles, states and labels': {
			sourceXml: EVERY_READ_XML,
			given: 'raw records',
			options: FULL_OPTIONS,
			expected: FULL,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const records = await source.query.getRecords(EVERY_READ_ELEMENTS)
			const held = records.flatMap((record) => (record ? [record] : []))
			const elements: AnyRefOrRecord[] = {
				refs: EVERY_READ_ELEMENTS,
				records: held,
				'raw records': held.map((record) => toRawRecord(record)),
			}[testCase.given]
			const infos = await ofEach(source.query, elements, testCase.options)
			expect(infos).toEqual(testCase.expected)
		},
	})
})

/**
 * A record given is described as given; where the description reads the record's stored neighbours (a signal's
 * siblings, the child a title reads, the labels), the stored record is read.
 */
describe('ofEach - a record given', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		/** The record handed over, from the stored one. */
		handOver: (stored: Core.AnyRawRecord) => Core.AnyRawRecord
		options?: InfoOptions
		expected: { title: string; labels?: unknown }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a Bay carrying another name → titled by the name it carries': {
			sourceXml: EVERY_READ_XML,
			ref: { tagName: 'Bay', id: 'bay1' },
			handOver: (stored) => ({ ...stored, attributes: [{ name: 'name', value: 'Given' }] }),
			expected: { title: 'Given' },
		},
		'a Bay handed over without its children, labels asked → its stored labels': {
			sourceXml: EVERY_READ_XML,
			ref: { tagName: 'Bay', id: 'bay1' },
			handOver: (stored) => ({ ...stored, children: [] }),
			options: { withLabels: true },
			expected: { title: 'B1', labels: { en: { '': 'Bay one' }, fr: { short: 'T1' } } },
		},
		'an ApplicationSclRef handed over without its children → titled by its stored SclFileReference':
			{
				sourceXml: EVERY_READ_XML,
				ref: { tagName: 'ApplicationSclRef', id: 'asr' },
				handOver: (stored) => ({ ...stored, children: [] }),
				expected: { title: 'ICD v1.A' },
			},
		'a ControlRef handed over with its LNode as parent → named among the signals of its stored Private':
			{
				sourceXml: EVERY_READ_XML,
				ref: { tagName: 'ControlRef', id: 'cr1' },
				handOver: (stored) => ({ ...stored, parent: { tagName: 'LNode', id: 'lnode' } }),
				expected: { title: 'Trip(1)' },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const stored = await source.query.getRecord(testCase.ref)
			if (!stored) throw new Error(`no ${testCase.ref.tagName} ${testCase.ref.id} in the fixture`)
			const [info] = await ofEach(
				source.query,
				[testCase.handOver(toRawRecord(stored))],
				testCase.options,
			)
			expect(info).toEqual(testCase.expected)
		},
	})
})

/** Inside a transaction the staged elements are described: names, signal siblings and labels as staged. */
describe('ofEach - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** Stages the change, then answers the elements to describe. */
		stage: (tx: Scl.Transaction) => Promise<AnyRefOrRecord[]>
		options?: InfoOptions
		expected: { title: string; labels?: unknown }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a SourceRef added beside a signal → both named among the staged signals': {
			sourceXml: EVERY_READ_XML,
			stage: async function addSibling(tx) {
				const added = await tx.any.addChild(
					{ tagName: 'Private', id: 'signals' },
					{
						tagName: 'SourceRef',
						namespace: V2019C1,
						attributes: { input: 'Trip', inputInst: '2' },
					},
				)
				return [{ tagName: 'SourceRef', id: 'sr1' }, added]
			},
			expected: [{ title: 'Trip(1)' }, { title: 'Trip(2)' }],
		},
		'a signal deleted → its sibling named alone': {
			sourceXml: EVERY_READ_XML,
			stage: async function deleteSibling(tx) {
				await tx.delete({ tagName: 'SourceRef', id: 'sr3' })
				return [
					{ tagName: 'SourceRef', id: 'sr2' },
					{ tagName: 'SourceRef', id: 'sr3' },
				]
			},
			expected: [{ title: 'Pos' }, { title: '' }],
		},
		'a Bay renamed and its label removed → the staged name and labels': {
			sourceXml: EVERY_READ_XML,
			stage: async function renameBay(tx) {
				await tx.update({ tagName: 'Bay', id: 'bay1' }, { attributes: { name: 'B9' } })
				await tx.delete({ tagName: 'Label', id: 'label-fr' })
				return [{ tagName: 'Bay', id: 'bay1' }]
			},
			options: { withLabels: true },
			expected: [{ title: 'B9', labels: { en: { '': 'Bay one' } } }],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const described: { infos?: unknown } = {}
			await source.transaction(async function describeStaged(tx) {
				const elements = await testCase.stage(tx)
				described.infos = await ofEach(tx, elements, testCase.options)
			})
			expect(described.infos).toEqual(testCase.expected)
		},
	})
})

/**
 * Inside a transaction a record given is read again by ref, so a record read before a staged write is described as
 * staged - its attributes, its state and what implements it - and one deleted in the transaction as missing.
 */
describe('ofEach - a record read before a staged write', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		/** Stages the change after the record was read. */
		stage: (tx: Scl.Transaction) => Promise<unknown>
		options?: InfoOptions
		expected: { title: string; state?: unknown }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a Bay renamed after it was read → the staged name': {
			sourceXml: EVERY_READ_XML,
			ref: { tagName: 'Bay', id: 'bay1' },
			stage: (tx) => tx.update({ tagName: 'Bay', id: 'bay1' }, { attributes: { name: 'B9' } }),
			expected: { title: 'B9' },
		},
		'an LNode unbound after it was read, state asked → unlocked and unmapped': {
			sourceXml: EVERY_READ_XML,
			ref: { tagName: 'LNode', id: 'lnode' },
			stage: (tx) =>
				tx.update({ tagName: 'LNode', id: 'lnode' }, { attributes: { iedName: 'None' } }),
			options: { mode: 'full', withState: true },
			expected: { title: 'None/LD0/PTRC1', state: { locked: false, mapping: 'unmapped' } },
		},
		'a Bay deleted after it was read → an empty title, as a ref to it': {
			sourceXml: EVERY_READ_XML,
			ref: { tagName: 'Bay', id: 'bay1' },
			stage: (tx) => tx.delete({ tagName: 'Bay', id: 'bay1' }),
			expected: { title: '' },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const described: { info?: unknown } = {}
			await source.transaction(async function describeStale(tx) {
				const stale = await tx.getRecord(testCase.ref)
				await testCase.stage(tx)
				const [info] = await ofEach(tx, stale ? [stale] : [], testCase.options)
				described.info = info
			})
			expect(described.info).toEqual(testCase.expected)
		},
	})
})
