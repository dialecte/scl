import breakersAndASubscriber from './fixtures/breakers-and-a-subscriber.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const SUBSCRIPTION = { tagName: 'ExtRef', id: 'ext8' } as Scl.Ref<Scl.ElementsOf>
const IED7_GOOSE = { tagName: 'GSEControl', id: 'gc7' } as Scl.Ref<Scl.ElementsOf>

describe('an edit removing every name of one pair of an input unbinds that pair only', () => {
	type TestCase = SclTest.BaseXmlTestCase & { removed: string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		// breakers-and-a-subscriber.xml: IED8's input names IED7's XCBR1 and GOOSE C1, by uuid and names
		'the control block names of an input removed → its control block uuid removed, its logical node kept':
			{
				sourceXml: breakersAndASubscriber,
				removed: ['srcLDInst', 'srcLNClass', 'srcCBName'],
				expectedQueries: ['//default:ExtRef[@intAddr="pos"][@lnUuid="xcbr1"][@iedName="IED7"]'],
				unexpectedQueries: ['//default:ExtRef[@srcCBUuid]'],
			},
		// the same input
		'the logical node names of an input removed → its logical node uuid removed, its IED name and control block kept':
			{
				sourceXml: breakersAndASubscriber,
				removed: ['ldInst', 'lnClass', 'lnInst'],
				expectedQueries: ['//default:ExtRef[@intAddr="pos"][@iedName="IED7"][@srcCBUuid="gc7"]'],
				unexpectedQueries: ['//default:ExtRef[@lnUuid]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const removed = Object.fromEntries(testCase.removed.map((name) => [name, undefined]))
		await source.transaction(async function unbindPair(tx) {
			// `update` removes an attribute given `undefined`
			await tx.any.update(SUBSCRIPTION, {
				attributes: removed as unknown as Record<string, string>,
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('an edit of a subscriber narrowing or widening what it names', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		subscriber: Record<string, string>
		edited: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's GOOSE gets a subscriber naming IED8's device LD1; its device name then removed
		"a device subscriber's device removed → unbound to its IED, the ldUuid removed": {
			sourceXml: breakersAndASubscriber,
			subscriber: { ldInst: 'LD1' },
			edited: { ldInst: undefined } as unknown as Record<string, string>,
			expectedQueries: ['//default:GSEControl/default:IEDName[.="IED8"]'],
			unexpectedQueries: ['//default:IEDName[@ldInst or @ldUuid]'],
		},
		// IED7's GOOSE gets a subscriber naming IED8's access point AP1; a device name is then added
		'an access point subscriber given a device → its apUuid kept, the device uuid written': {
			sourceXml: breakersAndASubscriber,
			subscriber: { apRef: 'AP1' },
			edited: { ldInst: 'LD1' },
			expectedQueries: ['//default:IEDName[.="IED8"][@apUuid="ap8"][@ldInst="LD1"][@ldUuid="ld8"]'],
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
		await source.transaction(async function editSubscriber(tx) {
			await tx.any.update(subscriber, { attributes: testCase.edited })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
