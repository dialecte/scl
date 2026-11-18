import breakersAndASubscriber from './fixtures/breakers-and-a-subscriber.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type Added = {
	parent: Scl.Ref<Scl.ElementsOf>
	tagName: string
	attributes: Record<string, string>
}

const IED7_DATA_SET = { tagName: 'DataSet', id: 'ds7' } as Scl.Ref<Scl.ElementsOf>
const IED7_DEVICE = { tagName: 'LDevice', id: 'ld7' } as Scl.Ref<Scl.ElementsOf>
const IED7_LLN0 = { tagName: 'LN0', id: 'ln07' } as Scl.Ref<Scl.ElementsOf>
const IED8_INPUTS = { tagName: 'Inputs', id: 'in8' } as Scl.Ref<Scl.ElementsOf>
const SUBSCRIPTION = { tagName: 'ExtRef', id: 'ext8' } as Scl.Ref<Scl.ElementsOf>
const XCBR3 = { lnClass: 'XCBR', inst: '3', lnType: 'XCBR_T', uuid: 'xcbr3' }
const ENTRY_FOR_XCBR3 = {
	ldInst: 'LD1',
	lnClass: 'XCBR',
	lnInst: '3',
	doName: 'Pos',
	daName: 'stVal',
	fc: 'ST',
}

describe('the commit gives a reference created by names only the uuid its names name', () => {
	type TestCase = SclTest.BaseXmlTestCase & { added: Added }

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's data set; its IED holds XCBR1
		'an entry naming XCBR1 by names → its lnUuid written': {
			sourceXml: breakersAndASubscriber,
			added: {
				parent: IED7_DATA_SET,
				tagName: 'FCDA',
				attributes: {
					ldInst: 'LD1',
					lnClass: 'XCBR',
					lnInst: '1',
					doName: 'Pos',
					daName: 'stVal',
					fc: 'ST',
				},
			},
			expectedQueries: ['//default:DataSet[@name="DS"]/default:FCDA[@lnInst="1"][@lnUuid="xcbr1"]'],
		},
		// IED8's inputs; IED7 holds XCBR2 and the GOOSE C1, the only control block named C1
		"an input naming IED7's XCBR2 and its GOOSE C1 by names → its lnUuid and srcCBUuid written": {
			sourceXml: breakersAndASubscriber,
			added: {
				parent: IED8_INPUTS,
				tagName: 'ExtRef',
				attributes: {
					iedName: 'IED7',
					ldInst: 'LD1',
					lnClass: 'XCBR',
					lnInst: '2',
					doName: 'Pos',
					srcLDInst: 'LD1',
					srcLNClass: 'LLN0',
					srcCBName: 'C1',
					intAddr: 'pos2',
				},
			},
			expectedQueries: ['//default:ExtRef[@intAddr="pos2"][@lnUuid="xcbr2"][@srcCBUuid="gc7"]'],
		},
		// IED7 holds no XCBR9
		'an input naming a logical node nothing holds → no uuid written': {
			sourceXml: breakersAndASubscriber,
			added: {
				parent: IED8_INPUTS,
				tagName: 'ExtRef',
				attributes: {
					iedName: 'IED7',
					ldInst: 'LD1',
					lnClass: 'XCBR',
					lnInst: '9',
					doName: 'Pos',
					intAddr: 'pos9',
				},
			},
			expectedQueries: ['//default:ExtRef[@intAddr="pos9"][@lnInst="9"]'],
			unexpectedQueries: ['//default:ExtRef[@intAddr="pos9"][@lnUuid]'],
		},
		// the substation S1; IED7 holds XCBR1
		"an LNode naming IED7's XCBR1 by names → never bound by the commit": {
			sourceXml: breakersAndASubscriber,
			added: {
				parent: { tagName: 'Substation', id: 's1' } as Scl.Ref<Scl.ElementsOf>,
				tagName: 'LNode',
				attributes: { iedName: 'IED7', ldInst: 'LD1', lnClass: 'XCBR', lnInst: '1' },
			},
			expectedQueries: ['//default:LNode[@iedName="IED7"][@lnInst="1"]'],
			unexpectedQueries: ['//default:LNode[@lnUuid]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { parent, tagName, attributes } = testCase.added
		await source.transaction(async function addReference(tx) {
			await tx.any.addChild(parent, { tagName, attributes })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit gives a reference by names only the uuid of what it names, created after it', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		entry: Record<string, string>
		node: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's data set gets an entry for XCBR3, then IED7 gets XCBR3, in one transaction
		'an entry by names, then the logical node it names, in one transaction → its lnUuid written': {
			sourceXml: breakersAndASubscriber,
			entry: ENTRY_FOR_XCBR3,
			node: XCBR3,
			expectedQueries: ['//default:FCDA[@lnInst="3"][@lnUuid="xcbr3"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addEntryThenNode(tx) {
			await tx.any.addChild(IED7_DATA_SET, { tagName: 'FCDA', attributes: testCase.entry })
			await tx.any.addChild(IED7_DEVICE, { tagName: 'LN', attributes: testCase.node })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit of a logical node gives the references naming it by names only its uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		entry: Record<string, string>
		node: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's data set gets an entry for XCBR3, which IED7 lacks; a later transaction adds XCBR3
		'an entry naming a logical node nothing holds, the logical node created later → its lnUuid written then':
			{
				sourceXml: breakersAndASubscriber,
				entry: ENTRY_FOR_XCBR3,
				node: XCBR3,
				expectedQueries: ['//default:FCDA[@lnInst="3"][@lnUuid="xcbr3"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addEntry(tx) {
			await tx.any.addChild(IED7_DATA_SET, { tagName: 'FCDA', attributes: testCase.entry })
		})
		await source.transaction(async function addNode(tx) {
			await tx.any.addChild(IED7_DEVICE, { tagName: 'LN', attributes: testCase.node })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit of a renamed logical node gives the references naming it by names only its uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		entry: Record<string, string>
		renamed: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's data set gets an entry for XCBR3, which IED7 lacks; a later transaction renames XCBR2 to XCBR3
		'an entry naming a logical node nothing holds, a logical node renamed to it later → its lnUuid written then':
			{
				sourceXml: breakersAndASubscriber,
				entry: ENTRY_FOR_XCBR3,
				renamed: { inst: '3' },
				expectedQueries: ['//default:FCDA[@lnInst="3"][@lnUuid="xcbr2"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addEntry(tx) {
			await tx.any.addChild(IED7_DATA_SET, { tagName: 'FCDA', attributes: testCase.entry })
		})
		await source.transaction(async function renameNode(tx) {
			await tx.any.update({ tagName: 'LN', id: 'xcbr2' }, { attributes: testCase.renamed })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit keeps the uuid and the names of an edited reference in agreement', () => {
	type TestCase = SclTest.BaseXmlTestCase & { edited: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// IED8's input names XCBR1 by uuid and names
		'its uuid pointed at XCBR2 → its names follow': {
			sourceXml: breakersAndASubscriber,
			edited: { lnUuid: 'xcbr2' },
			expectedQueries: ['//default:ExtRef[@intAddr="pos"][@lnUuid="xcbr2"][@lnInst="2"]'],
		},
		// the same input
		'its names pointed at XCBR2 → its uuid follows': {
			sourceXml: breakersAndASubscriber,
			edited: { lnInst: '2' },
			expectedQueries: ['//default:ExtRef[@intAddr="pos"][@lnUuid="xcbr2"][@lnInst="2"]'],
		},
		// the same input
		'its uuid and its names pointed at different logical nodes → the uuid wins, the names follow it':
			{
				sourceXml: breakersAndASubscriber,
				edited: { lnUuid: 'xcbr2', lnInst: '9' },
				expectedQueries: ['//default:ExtRef[@intAddr="pos"][@lnUuid="xcbr2"][@lnInst="2"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editReference(tx) {
			await tx.any.update(SUBSCRIPTION, { attributes: testCase.edited })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit leaves the uuid of a reference whose names it did not change', () => {
	type TestCase = SclTest.BaseXmlTestCase & { report: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// IED8's input names the GOOSE C1 by uuid, with no service: a report named C1 makes its names name two blocks
		'a report named like the GOOSE an input names added → the input keeps its srcCBUuid': {
			sourceXml: breakersAndASubscriber,
			report: { name: 'C1', confRev: '1' },
			expectedQueries: ['//default:ExtRef[@intAddr="pos"][@srcCBName="C1"][@srcCBUuid="gc7"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addReport(tx) {
			const report = await tx.any.addChild(IED7_LLN0, {
				tagName: 'ReportControl',
				attributes: testCase.report,
			})
			await tx.any.addChild(report, { tagName: 'OptFields', attributes: {} })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit gives no uuid to names naming several elements', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		report: Record<string, string>
		input: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// a report named C1 joins the GOOSE C1; an input with no service names C1 and XCBR2
		'an input naming by names a control block name two blocks share → its lnUuid written, no srcCBUuid':
			{
				sourceXml: breakersAndASubscriber,
				report: { name: 'C1', confRev: '1' },
				input: {
					iedName: 'IED7',
					ldInst: 'LD1',
					lnClass: 'XCBR',
					lnInst: '2',
					doName: 'Pos',
					srcLDInst: 'LD1',
					srcLNClass: 'LLN0',
					srcCBName: 'C1',
					intAddr: 'pos2',
				},
				expectedQueries: ['//default:ExtRef[@intAddr="pos2"][@lnUuid="xcbr2"][@srcCBName="C1"]'],
				unexpectedQueries: ['//default:ExtRef[@intAddr="pos2"][@srcCBUuid]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addReportAndInput(tx) {
			const report = await tx.any.addChild(IED7_LLN0, {
				tagName: 'ReportControl',
				attributes: testCase.report,
			})
			await tx.any.addChild(report, { tagName: 'OptFields', attributes: {} })
			await tx.any.addChild(IED8_INPUTS, { tagName: 'ExtRef', attributes: testCase.input })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
