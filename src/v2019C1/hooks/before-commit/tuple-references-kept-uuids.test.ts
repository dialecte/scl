import connectionsAndAVendorCopy from './fixtures/connections-and-a-vendor-copy.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const SUBSCRIPTION = { tagName: 'ExtRef', id: 'ext8' } as Scl.Ref<Scl.ElementsOf>
const IED7_DEVICE = { tagName: 'LDevice', id: 'ld7' } as Scl.Ref<Scl.ElementsOf>
const IED7_GOOSE = { tagName: 'GSEControl', id: 'gc7' } as Scl.Ref<Scl.ElementsOf>

describe('the commit fills a reference it did not write only from what the transaction created or renamed', () => {
	type TestCase = SclTest.BaseXmlTestCase & { node: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// IED8's input loses its lnUuid (its names, IED7's XCBR1, unchanged); a later transaction adds IED7's XCBR7
		'an input left without its uuid, another logical node created later → the input stays without uuid':
			{
				sourceXml: connectionsAndAVendorCopy,
				node: { lnClass: 'XCBR', inst: '7', lnType: 'XCBR_T', uuid: 'xcbr77' },
				expectedQueries: [
					'//default:ExtRef[@intAddr="pos"][@lnInst="1"]',
					'//default:LN[@uuid="xcbr77"]',
				],
				unexpectedQueries: ['//default:ExtRef[@lnUuid]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function dropInputUuid(tx) {
			// `update` removes an attribute given `undefined`
			await tx.any.update(SUBSCRIPTION, {
				attributes: { lnUuid: undefined } as unknown as Record<string, string>,
			})
		})
		await source.transaction(async function addNode(tx) {
			await tx.any.addChild(IED7_DEVICE, { tagName: 'LN', attributes: testCase.node })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit follows a subscriber narrowed from a logical node to its device', () => {
	type TestCase = SclTest.BaseXmlTestCase & { subscriber: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's GOOSE gets a subscriber naming IED8's CSWI1 in LD1 of AP1; a later transaction drops its logical node names
		'a subscriber naming a logical node, its logical node names removed → the device uuid written, the node uuid removed':
			{
				sourceXml: connectionsAndAVendorCopy,
				subscriber: { apRef: 'AP1', ldInst: 'LD1', lnClass: 'CSWI', lnInst: '1' },
				expectedQueries: [
					'//default:IEDName[.="IED8"][@apRef="AP1"][@ldInst="LD1"][@ldUuid="ld8"]',
				],
				unexpectedQueries: ['//default:IEDName[@lnUuid or @lnClass]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const subscriber = await source.transaction(async function addSubscriber(tx) {
			return tx.any.addChild(IED7_GOOSE, {
				tagName: 'IEDName',
				attributes: testCase.subscriber,
				value: 'IED8',
			})
		})
		await source.transaction(async function narrowSubscriber(tx) {
			await tx.any.update(subscriber, {
				attributes: { lnClass: undefined, lnInst: undefined } as unknown as Record<string, string>,
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit keeps the uuid of a reference whose names a rename rewrote', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		renamed: Scl.Ref<Scl.ElementsOf>
		attributes: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED8's input names IED7's XCBR1 by uuid; XCBR1 renumbered 5
		'the logical node an input names renumbered → its names follow, its uuids kept': {
			sourceXml: connectionsAndAVendorCopy,
			renamed: { tagName: 'LN', id: 'xcbr7' },
			attributes: { inst: '5' },
			expectedQueries: [
				'//default:ExtRef[@intAddr="pos"][@lnInst="5"][@lnUuid="xcbr7"][@srcCBUuid="gc7"]',
			],
		},
		// the same input; its control block named in the data's device LD1, renamed LD5
		'the device an input and its control block name renamed → its names follow, its uuids kept': {
			sourceXml: connectionsAndAVendorCopy,
			renamed: IED7_DEVICE,
			attributes: { inst: 'LD5' },
			expectedQueries: [
				'//default:ExtRef[@intAddr="pos"][@ldInst="LD5"][@lnUuid="xcbr7"][@srcCBUuid="gc7"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function rename(tx) {
			await tx.any.update(testCase.renamed, { attributes: testCase.attributes })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit leaves a uuid naming no target of the document', () => {
	type TestCase = SclTest.BaseXmlTestCase & { uuid: string; renamed: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// IED8's input pointed at a uuid of another document (a template's), then its names edited
		'an input naming a uuid no element of the document holds, its names edited → the uuid kept': {
			sourceXml: connectionsAndAVendorCopy,
			allowInvalidOutput: {
				reason: 'the input names by uuid an element of another document, as the case sets it',
				violations: [{ check: 'references', code: 'dangling' }],
			},
			uuid: 'template-xcbr',
			renamed: { lnInst: '2' },
			expectedQueries: ['//default:ExtRef[@intAddr="pos"][@lnInst="2"][@lnUuid="template-xcbr"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function pointElsewhere(tx) {
			await tx.any.update(SUBSCRIPTION, { attributes: { lnUuid: testCase.uuid } })
		})
		await source.transaction(async function editNames(tx) {
			await tx.any.update(SUBSCRIPTION, { attributes: testCase.renamed })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
