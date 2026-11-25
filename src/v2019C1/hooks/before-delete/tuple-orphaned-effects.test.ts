import breakerSubscribedAndControlled from './fixtures/breaker-subscribed-and-controlled.xml?raw'
import dataSetsSentByThreeBlocks from './fixtures/data-sets-sent-by-three-blocks.xml?raw'
import gooseSubscribedByItsOwnAccessPoint from './fixtures/goose-subscribed-by-its-own-access-point.xml?raw'
import inputsWithoutInternalAddress from './fixtures/inputs-without-internal-address.xml?raw'
import subscriberNamingItsAccessPointByName from './fixtures/subscriber-naming-its-access-point-by-name.xml?raw'
import subscribersAtEveryLevel from './fixtures/subscribers-at-every-level.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('delete cascade over references by uuid: what each deletion leaves of its data sets, subscriptions and inputs', () => {
	type TestCase = SclTest.BaseXmlTestCase & { deleted: Scl.Ref<Scl.ElementsOf> }

	const testCases: SclTest.TestCases<TestCase> = {
		// DS (two entries naming XCBR1) sent by the report (confRev 3) and the sampled values (at the limit); the GOOSE sends DS2
		'the breaker two entries of one data set name deleted → its report revision rises once, the sampled values at their limit stay, the GOOSE sending another data set stays':
			{
				sourceXml: dataSetsSentByThreeBlocks,
				deleted: { tagName: 'LN', id: 'xcbr7' },
				expectedQueries: [
					'//default:ReportControl[@name="RC"][@confRev="4"]',
					'//default:SampledValueControl[@name="SV"][@confRev="4294967295"]',
					'//default:GSEControl[@name="GC"][@confRev="1"]',
					'//default:DataSet[@name="DS2"]/default:FCDA[@lnUuid="cswi7"]',
				],
				unexpectedQueries: ['//default:FCDA[@lnUuid="xcbr7"]'],
			},
		// the same IED: its device LD1, its server's only one, holds the data sets, their control blocks and the nodes the
		// entries name
		'the device holding the data sets and the logical nodes they name deleted → its server goes with it, the access point stays':
			{
				sourceXml: dataSetsSentByThreeBlocks,
				deleted: { tagName: 'LDevice', id: 'ld7' },
				expectedQueries: ['//default:IED/default:AccessPoint[@name="AP1"]'],
				unexpectedQueries: [
					'//default:LDevice',
					'//default:FCDA',
					'//default:Server',
					'//default:Authentication',
				],
			},
		// IED7's GOOSE sends an entry naming XCBR1 under AP2, and AP2 subscribes to that GOOSE
		'the access point holding the named breaker and subscribing to the GOOSE deleted → the entry and the subscription go, the GOOSE revision rises':
			{
				sourceXml: gooseSubscribedByItsOwnAccessPoint,
				deleted: { tagName: 'AccessPoint', id: 'ap7b' },
				expectedQueries: ['//default:GSEControl[@name="GC"][@confRev="2"]'],
				unexpectedQueries: ['//default:GSEControl/default:IEDName', '//default:FCDA'],
			},
		// IED8's IHMI1 subscribes to the GOOSE through its access point AP1 and device LD1
		'a logical node subscribing through its access point deleted → the subscription keeps its access point and device, its logical node parts cleared':
			{
				sourceXml: subscribersAtEveryLevel,
				deleted: { tagName: 'LN', id: 'ihmi1' },
				expectedQueries: [
					'//default:GSEControl/default:IEDName[.="IED8"][@apRef="AP1"][@apUuid="ap8"][@ldInst="LD1"]',
				],
				unexpectedQueries: [
					'//default:GSEControl/default:IEDName[@lnClass or @lnInst or @lnUuid or @prefix]',
				],
			},
		// IED8's IHMI3, in device LD2, subscribes to the sampled values by its lnUuid only
		'the device holding a subscribing logical node deleted → the subscription of the IED kept, its device and logical node parts cleared':
			{
				sourceXml: subscribersAtEveryLevel,
				deleted: { tagName: 'LDevice', id: 'ld8b' },
				expectedQueries: ['//default:SampledValueControl/default:IEDName[.="IED8"]'],
				unexpectedQueries: [
					'//default:SampledValueControl/default:IEDName[@ldInst or @lnClass or @lnInst or @lnUuid]',
				],
			},
		// IED8's device LD1 subscribes to the GOOSE (ldUuid), and so does IHMI1 inside it (apUuid and lnUuid)
		'a subscribing device deleted → its subscription and the one of a logical node in it keep the IED, their device parts cleared':
			{
				sourceXml: subscribersAtEveryLevel,
				deleted: { tagName: 'LDevice', id: 'ld8' },
				expectedQueries: [
					'//default:GSEControl/default:IEDName[.="IED8"][not(@apUuid)]',
					'//default:GSEControl/default:IEDName[.="IED8"][@apUuid="ap8"][@apRef="AP1"]',
				],
				unexpectedQueries: ['//default:GSEControl/default:IEDName[@ldInst or @ldUuid or @lnUuid]'],
			},
		// every subscription of the file names IED8, at device or logical node level
		'the subscribing IED deleted → every subscription naming it goes': {
			sourceXml: subscribersAtEveryLevel,
			deleted: { tagName: 'IED', id: 'ied8' },
			expectedQueries: [
				'//default:GSEControl[@name="GC"]',
				'//default:SampledValueControl[@name="SV"]',
			],
			unexpectedQueries: ['//default:IEDName'],
		},
		// IED8's IHMI3 subscribes through its access point AP1, named by apRef only; IED8 keeps AP0
		'the access point holding a subscribing logical node deleted, named by name only → the subscription goes':
			{
				sourceXml: subscriberNamingItsAccessPointByName,
				deleted: { tagName: 'AccessPoint', id: 'ap8' },
				expectedQueries: ['//default:IED[@name="IED8"]/default:AccessPoint[@name="AP0"]'],
				unexpectedQueries: ['//default:IEDName'],
			},
		// IED8's input and control name the breaker by uuid and hold no internal address
		'the breaker deleted, an input and a control naming it with no internal address → both go': {
			sourceXml: inputsWithoutInternalAddress,
			deleted: { tagName: 'LN', id: 'xcbr7' },
			unexpectedQueries: ['//default:ExtRef', '//default:ExtCtrl'],
		},
		// IED8's input names the breaker and the GOOSE, both in IED7's LD1
		'the device holding the breaker and the GOOSE deleted → the input naming both keeps its internal address, its whole source and service cleared':
			{
				sourceXml: breakerSubscribedAndControlled,
				deleted: { tagName: 'LDevice', id: 'ld7' },
				expectedQueries: ['//default:ExtRef[@intAddr="posStVal"]'],
				unexpectedQueries: [
					'//default:ExtRef[@iedName or @ldInst or @lnClass or @lnInst or @doName or @daName or @lnUuid]',
					'//default:ExtRef[@srcLDInst or @srcLNClass or @srcCBName or @srcCBUuid]',
					'//default:ExtRef[@serviceType]',
				],
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

describe('delete cascade over an input the same transaction edits first', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		internalAddress: string
		deleted: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED8's input names IED7's breaker by uuid; the transaction moves its internal address, then deletes the breaker
		'the input given a new internal address, then the breaker it names deleted → the new internal address kept, its source cleared':
			{
				sourceXml: breakerSubscribedAndControlled,
				internalAddress: 'posStVal2',
				deleted: { tagName: 'LN', id: 'xcbr7' },
				expectedQueries: ['//default:ExtRef[@intAddr="posStVal2"]'],
				unexpectedQueries: ['//default:ExtRef[@lnUuid or @iedName or @srcCBUuid]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editThenDelete(tx) {
			await tx.any.update(
				{ tagName: 'ExtRef', id: 'ext8' },
				{ attributes: { intAddr: testCase.internalAddress } },
			)
			await tx.delete(testCase.deleted)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
