import connectionsAndAVendorCopy from './fixtures/connections-and-a-vendor-copy.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type Added = {
	parent: Scl.Ref<Scl.ElementsOf>
	tagName: string
	attributes: Record<string, string>
	value?: string
}

const IED7_DATA_SET = { tagName: 'DataSet', id: 'ds7' } as Scl.Ref<Scl.ElementsOf>
const IED8_INPUTS = { tagName: 'Inputs', id: 'in8' } as Scl.Ref<Scl.ElementsOf>
const CONNECTION = { tagName: 'ConnectedAP', id: 'cap7' } as Scl.Ref<Scl.ElementsOf>
const ENTRY = { ldInst: 'LD1', lnClass: 'XCBR', doName: 'Pos', daName: 'stVal', fc: 'ST' }

describe('the commit follows a connection moved to another IED down to the addresses it holds', () => {
	type TestCase = SclTest.BaseXmlTestCase & { edited: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// the connection of IED7's AP1 holds the address of IED7's GOOSE C1; IED8's AP1 holds a GOOSE C1 too
		'the connection pointed at IED8 by its names → its access point uuid and its GOOSE address uuid follow':
			{
				sourceXml: connectionsAndAVendorCopy,
				edited: { iedName: 'IED8' },
				expectedQueries: [
					'//default:ConnectedAP[@iedName="IED8"][@apUuid="ap8"]/default:GSE[@cbUuid="gc8"]',
				],
			},
		// the same connection
		'the connection pointed at IED8 by its uuid → its names and its GOOSE address uuid follow': {
			sourceXml: connectionsAndAVendorCopy,
			edited: { apUuid: 'ap8' },
			expectedQueries: [
				'//default:ConnectedAP[@iedName="IED8"][@apUuid="ap8"]/default:GSE[@cbUuid="gc8"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveConnection(tx) {
			await tx.any.update(CONNECTION, { attributes: testCase.edited })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit resolves the names of a created reference as its kind writes them', () => {
	type TestCase = SclTest.BaseXmlTestCase & { added: Added }

	const testCases: SclTest.TestCases<TestCase> = {
		// IED8's inputs; IED8 holds CSWI1
		'an input naming a logical node of its own IED by "@" → its lnUuid written': {
			sourceXml: connectionsAndAVendorCopy,
			added: {
				parent: IED8_INPUTS,
				tagName: 'ExtRef',
				attributes: {
					iedName: '@',
					ldInst: 'LD1',
					lnClass: 'CSWI',
					lnInst: '1',
					doName: 'Pos',
					intAddr: 'own',
				},
			},
			expectedQueries: ['//default:ExtRef[@intAddr="own"][@iedName="@"][@lnUuid="cswi8"]'],
		},
		// IED7's GOOSE; IED8's access point AP1
		'a subscriber naming its IED by its text and its access point → its apUuid written': {
			sourceXml: connectionsAndAVendorCopy,
			added: {
				parent: { tagName: 'GSEControl', id: 'gc7' } as Scl.Ref<Scl.ElementsOf>,
				tagName: 'IEDName',
				attributes: { apRef: 'AP1' },
				value: 'IED8',
			},
			expectedQueries: [
				'//default:GSEControl[@name="C1"]/default:IEDName[.="IED8"][@apUuid="ap8"]',
			],
		},
		// IED7's data set; only IED7's vendor Private holds a logical node XCBR4
		'an entry naming a logical node only vendor payload holds → no uuid written': {
			sourceXml: connectionsAndAVendorCopy,
			added: { parent: IED7_DATA_SET, tagName: 'FCDA', attributes: { ...ENTRY, lnInst: '4' } },
			expectedQueries: ['//default:FCDA[@lnInst="4"]'],
			unexpectedQueries: ['//default:FCDA[@lnUuid]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { parent, tagName, attributes, value } = testCase.added
		await source.transaction(async function addReference(tx) {
			await tx.any.addChild(parent, { tagName, attributes, value })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit of an IED renamed gives the references naming it by names only their uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		input: Record<string, string>
		renamed: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// an input names IED9's XCBR1, which nothing holds; IED7 (holding XCBR1) is then renamed IED9; ext8 names it by uuid
		'an input naming an IED nothing holds, an IED renamed to it later → its uuid written, the input by uuid keeps its own':
			{
				sourceXml: connectionsAndAVendorCopy,
				input: {
					iedName: 'IED9',
					ldInst: 'LD1',
					lnClass: 'XCBR',
					lnInst: '1',
					doName: 'Pos',
					intAddr: 'later',
				},
				renamed: { name: 'IED9' },
				expectedQueries: [
					'//default:ExtRef[@intAddr="later"][@lnUuid="xcbr7"]',
					'//default:ExtRef[@intAddr="pos"][@iedName="IED9"][@lnUuid="xcbr7"][@srcCBUuid="gc7"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addInput(tx) {
			await tx.any.addChild(IED8_INPUTS, { tagName: 'ExtRef', attributes: testCase.input })
		})
		await source.transaction(async function renameIed(tx) {
			await tx.any.update({ tagName: 'IED', id: 'ied7' }, { attributes: testCase.renamed })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit resolves a reference by its names as the transaction leaves them', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		entry: Record<string, string>
		edited: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's data set gets an entry naming XCBR9, then the same transaction points it at XCBR1
		'an entry created by names, then edited in the same transaction → the uuid of what its last names name':
			{
				sourceXml: connectionsAndAVendorCopy,
				entry: { ...ENTRY, lnInst: '9' },
				edited: { lnInst: '1' },
				expectedQueries: ['//default:FCDA[@lnInst="1"][@lnUuid="xcbr7"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addThenEditEntry(tx) {
			const entry = await tx.any.addChild(IED7_DATA_SET, {
				tagName: 'FCDA',
				attributes: testCase.entry,
			})
			await tx.any.update(entry, { attributes: testCase.edited })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit gives no uuid of an element the same transaction deletes', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		entry: Record<string, string>
		deleted: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's data set gets an entry naming XCBR1, which the same transaction deletes
		'an entry created naming a logical node the transaction deletes → no uuid written': {
			sourceXml: connectionsAndAVendorCopy,
			entry: { ...ENTRY, lnInst: '1' },
			deleted: { tagName: 'LN', id: 'xcbr7' },
			expectedQueries: ['//default:FCDA[@lnInst="1"]'],
			unexpectedQueries: ['//default:FCDA[@lnUuid]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addEntryDeleteNode(tx) {
			await tx.any.addChild(IED7_DATA_SET, { tagName: 'FCDA', attributes: testCase.entry })
			await tx.delete(testCase.deleted)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
