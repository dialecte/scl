import breakerSubscribedAndControlled from './fixtures/breaker-subscribed-and-controlled.xml?raw'
import reportsSubscribersAndCommunication from './fixtures/reports-subscribers-and-communication.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('delete cascade over the references naming their target by its address and uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & { deleted: Scl.Ref<Scl.ElementsOf> }

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's breaker XCBR1, named by uuid by the stVal entry (its data set's only one), IED8's input and IED8's control
		'the breaker deleted → its entry and the data set it empties go, the GOOSE loses its data set and its revision rises once, the input and the control keep their internal address':
			{
				sourceXml: breakerSubscribedAndControlled,
				deleted: { tagName: 'LN', id: 'xcbr7' },
				expectedQueries: [
					'//default:GSEControl[@name="GC"][@confRev="2"]',
					'//default:ExtRef[@intAddr="posStVal"][@desc="breaker position"]',
					'//default:ExtCtrl[@intAddr="posOper"][@desc="breaker control"]',
				],
				unexpectedQueries: [
					'//default:FCDA[@daName="stVal"]',
					'//default:DataSet',
					'//default:GSEControl[@datSet]',
					'//default:ExtRef[@iedName or @ldInst or @lnClass or @lnInst or @doName or @daName or @lnUuid]',
					'//default:ExtRef[@srcLDInst or @srcLNClass or @srcCBName or @srcCBUuid]',
					'//default:ExtRef[@serviceType]',
					'//default:ExtCtrl[@iedName or @ldInst or @lnClass or @lnInst or @doName or @lnUuid]',
				],
			},
		// IED7's GOOSE control block, named by uuid by IED8's input
		'the GOOSE control block deleted → the input keeps its data source, the control block it names cleared':
			{
				sourceXml: breakerSubscribedAndControlled,
				deleted: { tagName: 'GSEControl', id: 'gc7' },
				expectedQueries: [
					'//default:ExtRef[@intAddr="posStVal"][@iedName="IED7"][@doName="Pos"][@daName="stVal"][@lnUuid="xcbr7"]',
				],
				unexpectedQueries: [
					'//default:ExtRef[@srcLDInst or @srcLNClass or @srcCBName or @srcCBUuid]',
				],
			},
		// IED7's AP1, named by uuid by IED7's ServerAt in AP2
		'the access point deleted → the access point served through it loses its reference': {
			sourceXml: breakerSubscribedAndControlled,
			deleted: { tagName: 'AccessPoint', id: 'ap7' },
			expectedQueries: ['//default:AccessPoint[@name="AP2"]'],
			unexpectedQueries: ['//default:ServerAt'],
		},
		// IED7's AP1, named by uuid by IED8's KDC
		'the access point deleted → the key server naming it goes': {
			sourceXml: breakerSubscribedAndControlled,
			deleted: { tagName: 'AccessPoint', id: 'ap7' },
			expectedQueries: ['//default:IED[@name="IED8"]/default:AccessPoint'],
			unexpectedQueries: ['//default:KDC'],
		},
		// IED8's control LN, holding the control: what refers from inside it goes with it, nothing outside changes
		'the controlling logical node deleted → nothing outside it changes': {
			sourceXml: breakerSubscribedAndControlled,
			deleted: { tagName: 'LN', id: 'cswi8' },
			expectedQueries: [
				'//default:GSEControl[@name="GC"][@confRev="1"]',
				'//default:FCDA[@daName="stVal"][@lnUuid="xcbr7"]',
				'//default:ExtRef[@srcCBUuid="gc7"][@lnUuid="xcbr7"]',
				'//default:KDC[@apUuid="ap7"]',
			],
			unexpectedQueries: ['//default:ExtCtrl'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteTarget(tx) {
			await tx.delete(testCase.deleted)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('delete cascade over a reference added by names only', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The entry added through the API by names only, in a transaction before the delete (an import fills its uuid). */
		entry: Record<string, string>
		deleted: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// an entry for the breaker's quality, added with its names and the breaker's lnUuid (the caller resolved them)
		'an entry added naming the breaker by names and uuid, the breaker deleted → it goes': {
			sourceXml: breakerSubscribedAndControlled,
			entry: {
				ldInst: 'LD1',
				lnClass: 'XCBR',
				lnInst: '1',
				doName: 'Pos',
				daName: 'q',
				fc: 'ST',
				lnUuid: 'xcbr7',
			},
			deleted: { tagName: 'LN', id: 'xcbr7' },
			expectedQueries: ['//default:GSEControl[@name="GC"][@confRev="2"]'],
			unexpectedQueries: ['//default:FCDA'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addNamesOnlyEntry(tx) {
			await tx.any.addChild(
				{ tagName: 'DataSet', id: 'ds7' },
				{ tagName: 'FCDA', attributes: testCase.entry },
			)
		})
		await source.transaction(async function deleteTarget(tx) {
			await tx.delete(testCase.deleted)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('delete cascade over the report clients, subscribers, associations and addresses naming their target by uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & { deleted: Scl.Ref<Scl.ElementsOf> }

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's report goes to IHMI1, IHMI2, IHMI3 in that order
		'the middle report client deleted → its client entry goes, the two others keep their order': {
			sourceXml: reportsSubscribersAndCommunication,
			deleted: { tagName: 'LN', id: 'ihmi2' },
			expectedQueries: [
				'//default:RptEnabled[@max="3"]/default:ClientLN[1][@lnInst="1"][@lnUuid="ihmi1"]',
				'//default:RptEnabled[@max="3"]/default:ClientLN[2][@lnInst="3"][@lnUuid="ihmi3"]',
			],
			unexpectedQueries: [
				'//default:ClientLN[@lnInst="2"]',
				'//default:RptEnabled/default:ClientLN[3]',
			],
		},
		// IED8's IHMI3 subscribes to IED7's sampled values at logical node level
		'the subscribing logical node deleted → the subscription of its device kept, its logical node parts cleared':
			{
				sourceXml: reportsSubscribersAndCommunication,
				deleted: { tagName: 'LN', id: 'ihmi3' },
				expectedQueries: ['//default:SampledValueControl/default:IEDName[.="IED8"][@ldInst="LD1"]'],
				unexpectedQueries: [
					'//default:SampledValueControl/default:IEDName[@prefix or @lnClass or @lnInst or @lnUuid]',
				],
			},
		// IED9's AP1 subscribes to IED7's GOOSE at access point level
		'the subscribing access point deleted → the subscription goes': {
			sourceXml: reportsSubscribersAndCommunication,
			deleted: { tagName: 'AccessPoint', id: 'ap9' },
			expectedQueries: ['//default:GSEControl[@name="GC"]'],
			unexpectedQueries: ['//default:GSEControl/default:IEDName'],
		},
		// IED9's AP1 is connected to the subnetwork
		'the connected access point deleted → its connection goes, the other stays': {
			sourceXml: reportsSubscribersAndCommunication,
			deleted: { tagName: 'AccessPoint', id: 'ap9' },
			expectedQueries: ['//default:ConnectedAP[@iedName="IED7"]/default:GSE'],
			unexpectedQueries: ['//default:ConnectedAP[@iedName="IED9"]'],
		},
		// IED7's server holds an association with IED8's IHMI1
		'the associated logical node deleted → the association goes': {
			sourceXml: reportsSubscribersAndCommunication,
			deleted: { tagName: 'LN', id: 'ihmi1' },
			expectedQueries: ['//default:Server/default:Authentication'],
			unexpectedQueries: ['//default:Association'],
		},
		// IED7's connection holds the addresses of its GOOSE (GSE) and its sampled values (SMV)
		'the GOOSE control block deleted → its address goes, the connection and the sampled value address stay':
			{
				sourceXml: reportsSubscribersAndCommunication,
				deleted: { tagName: 'GSEControl', id: 'gc7' },
				expectedQueries: ['//default:ConnectedAP[@iedName="IED7"]/default:SMV[@cbUuid="sv7"]'],
				unexpectedQueries: ['//default:GSE'],
			},
		// the same connection: the sampled value address named by uuid beside the GOOSE one
		'the sampled value control block deleted → its address goes, the connection and the GOOSE address stay':
			{
				sourceXml: reportsSubscribersAndCommunication,
				deleted: { tagName: 'SampledValueControl', id: 'sv7' },
				expectedQueries: ['//default:ConnectedAP[@iedName="IED7"]/default:GSE[@cbUuid="gc7"]'],
				unexpectedQueries: ['//default:SMV'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteTarget(tx) {
			await tx.delete(testCase.deleted)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
