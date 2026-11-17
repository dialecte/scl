import breakersAndASubscriber from './fixtures/breakers-and-a-subscriber.xml?raw'
import connectionToAnIedWithoutTheGoose from './fixtures/connection-to-an-ied-without-the-goose.xml?raw'
import connectionsAndAVendorCopy from './fixtures/connections-and-a-vendor-copy.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const SUBSCRIPTION = { tagName: 'ExtRef', id: 'ext8' } as Scl.Ref<Scl.ElementsOf>
const CONNECTION = { tagName: 'ConnectedAP', id: 'cap7' } as Scl.Ref<Scl.ElementsOf>

type Refusal = {
	key: string | undefined
	meta: unknown
}

/** The refusal of a transaction, or none. */
async function refusalOf(params: { run: () => Promise<unknown> }): Promise<Refusal | undefined> {
	return params
		.run()
		.then(function committed() {
			return undefined
		})
		.catch(function refused(error: unknown) {
			const dialecteError = toDialecteError(error)
			return { key: dialecteError?.key, meta: dialecteError?.meta }
		})
}

describe('an edit of the names of a reference holding a uuid never drops the uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		reference: Scl.Ref<Scl.ElementsOf>
		edited: Record<string, string>
		expected: Refusal
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// breakers-and-a-subscriber.xml: IED8's input names IED7's XCBR1 by uuid and names; IED7 holds no XCBR9
		'the names of an input pointed at a logical node nothing holds → refused, the uuid kept': {
			sourceXml: breakersAndASubscriber,
			reference: SUBSCRIPTION,
			edited: { lnInst: '9' },
			expected: {
				key: 'REFERENCE_NAMES_UNRESOLVED',
				meta: {
					reference: { tagName: 'ExtRef', id: 'ext8' },
					uuidAttribute: 'lnUuid',
					address: 'ln:IED7/LD1/XCBR9',
					resolved: 'none',
				},
			},
		},
		// connections-and-a-vendor-copy.xml: IED8's input names its control block in the data's device (no srcLDInst)
		'the device of an input naming its control block in the data device pointed at one nothing holds → refused':
			{
				sourceXml: connectionsAndAVendorCopy,
				reference: SUBSCRIPTION,
				edited: { ldInst: 'LD9' },
				expected: {
					key: 'REFERENCE_NAMES_UNRESOLVED',
					meta: {
						reference: { tagName: 'ExtRef', id: 'ext8' },
						uuidAttribute: 'lnUuid',
						address: 'ln:IED7/LD9/XCBR1',
						resolved: 'none',
					},
				},
			},
		// the same input, its service GOOSE: IED7 holds no report named C1
		'the service of an input pointed at reports → refused, its control block uuid kept': {
			sourceXml: connectionsAndAVendorCopy,
			reference: SUBSCRIPTION,
			edited: { serviceType: 'Report' },
			expected: {
				key: 'REFERENCE_NAMES_UNRESOLVED',
				meta: {
					reference: { tagName: 'ExtRef', id: 'ext8' },
					uuidAttribute: 'srcCBUuid',
					address: 'cb:IED7/LD1/LLN0.C1',
					resolved: 'none',
				},
			},
		},
		// breakers-and-a-subscriber.xml: IED8's input (no service) names IED7's GOOSE C1; polling names no control block
		'the service of an input switched to polling, its control block names left → refused': {
			sourceXml: breakersAndASubscriber,
			reference: SUBSCRIPTION,
			edited: { serviceType: 'Poll' },
			expected: {
				key: 'REFERENCE_NAMES_UNRESOLVED',
				meta: {
					reference: { tagName: 'ExtRef', id: 'ext8' },
					uuidAttribute: 'srcCBUuid',
					address: 'cb:IED7/LD1/LLN0.C1',
					resolved: 'none',
				},
			},
		},
		// connection-to-an-ied-without-the-goose.xml: IED7's connection holds the address of its GOOSE C1; IED8 has no C1
		'a connection moved to an IED holding no control block of its address → refused, naming the address':
			{
				sourceXml: connectionToAnIedWithoutTheGoose,
				reference: CONNECTION,
				edited: { iedName: 'IED8' },
				expected: {
					key: 'REFERENCE_NAMES_UNRESOLVED',
					meta: {
						reference: { tagName: 'GSE', id: 'gse7' },
						uuidAttribute: 'cbUuid',
						address: 'cb:IED8/LD1/LLN0.C1',
						resolved: 'none',
					},
				},
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const refused = await refusalOf({
			run: () =>
				source.transaction(async function editNames(tx) {
					await tx.any.update(testCase.reference, { attributes: testCase.edited })
				}),
		})
		expect(refused).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('an edit of the names of a reference to names naming several elements', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		report: Record<string, string>
		goose: Record<string, string>
		edited: Record<string, string>
		expected: Refusal
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// breakers-and-a-subscriber.xml: IED7 gets a report and a GOOSE both named C2; IED8's input (no service) is
		// pointed at C2
		'the control block name of an input pointed at a name two blocks share → refused, naming both':
			{
				sourceXml: breakersAndASubscriber,
				report: { name: 'C2', confRev: '1' },
				goose: { name: 'C2', appID: 'C2', confRev: '1' },
				edited: { srcCBName: 'C2' },
				expected: {
					key: 'REFERENCE_NAMES_UNRESOLVED',
					meta: {
						reference: { tagName: 'ExtRef', id: 'ext8' },
						uuidAttribute: 'srcCBUuid',
						address: 'cb:IED7/LD1/LLN0.C2',
						resolved: 'several',
					},
				},
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const lln0 = { tagName: 'LN0', id: 'ln07' } as Scl.Ref<Scl.ElementsOf>
		await source.transaction(async function addBlocks(tx) {
			const report = await tx.any.addChild(lln0, {
				tagName: 'ReportControl',
				attributes: testCase.report,
			})
			await tx.any.addChild(report, { tagName: 'OptFields', attributes: {} })
			await tx.any.addChild(lln0, { tagName: 'GSEControl', attributes: testCase.goose })
		})
		const refused = await refusalOf({
			run: () =>
				source.transaction(async function editNames(tx) {
					await tx.any.update(SUBSCRIPTION, { attributes: testCase.edited })
				}),
		})
		expect(refused).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('an edit removing every name of a pair unbinds it', () => {
	type TestCase = SclTest.BaseXmlTestCase & { removed: string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		// breakers-and-a-subscriber.xml: IED8's input names IED7's XCBR1 and GOOSE C1, by uuid and names
		'every source name of an input removed → both uuids removed, the input unbound, its internal address kept':
			{
				sourceXml: breakersAndASubscriber,
				removed: ['iedName', 'ldInst', 'lnClass', 'lnInst', 'srcLDInst', 'srcLNClass', 'srcCBName'],
				expectedQueries: ['//default:ExtRef[@intAddr="pos"]'],
				unexpectedQueries: ['//default:ExtRef[@lnUuid or @srcCBUuid]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const removed = Object.fromEntries(testCase.removed.map((name) => [name, undefined]))
		await source.transaction(async function unbind(tx) {
			// `update` removes an attribute given `undefined`
			await tx.any.update(SUBSCRIPTION, {
				attributes: removed as unknown as Record<string, string>,
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('an edit of the names of a reference to an address two elements of one kind share', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		nodes: Record<string, string>[]
		edited: Record<string, string>
		expected: Refusal
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// breakers-and-a-subscriber.xml: IED7 gets two logical nodes XCBR5; IED8's input is pointed at XCBR5
		'the names of an input pointed at an address two logical nodes share → refused, naming several':
			{
				sourceXml: breakersAndASubscriber,
				nodes: [
					{ lnClass: 'XCBR', inst: '5', lnType: 'XCBR_T', uuid: 'xcbr5a' },
					{ lnClass: 'XCBR', inst: '5', lnType: 'XCBR_T', uuid: 'xcbr5b' },
				],
				edited: { lnInst: '5' },
				expected: {
					key: 'REFERENCE_NAMES_UNRESOLVED',
					meta: {
						reference: { tagName: 'ExtRef', id: 'ext8' },
						uuidAttribute: 'lnUuid',
						address: 'ln:IED7/LD1/XCBR5',
						resolved: 'several',
					},
				},
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const device = { tagName: 'LDevice', id: 'ld7' } as Scl.Ref<Scl.ElementsOf>
		await source.transaction(async function addNodes(tx) {
			for (const node of testCase.nodes)
				await tx.any.addChild(device, { tagName: 'LN', attributes: node })
		})
		const refused = await refusalOf({
			run: () =>
				source.transaction(async function editNames(tx) {
					await tx.any.update(SUBSCRIPTION, { attributes: testCase.edited })
				}),
		})
		expect(refused).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('an edit of the names of a subscriber naming a device', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		edited: { attributes?: Record<string, string>; value?: string }
		/** The refusal, the subscriber's id left out (made by the case). */
		expected: {
			key: string | undefined
			uuidAttribute: unknown
			address: unknown
			resolved: unknown
		}
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// breakers-and-a-subscriber.xml: IED7's GOOSE gets a subscriber naming IED8's device LD1 (its ldUuid written)
		"a device subscriber's device pointed at one nothing holds → refused, its ldUuid kept": {
			sourceXml: breakersAndASubscriber,
			edited: { attributes: { ldInst: 'LD9' } },
			expected: {
				key: 'REFERENCE_NAMES_UNRESOLVED',
				uuidAttribute: 'ldUuid',
				address: 'ld:IED8/LD9',
				resolved: 'none',
			},
		},
		// the same subscriber, its IED named by its text
		"a device subscriber's IED pointed at one nothing holds → refused, its ldUuid kept": {
			sourceXml: breakersAndASubscriber,
			edited: { value: 'IED9' },
			expected: {
				key: 'REFERENCE_NAMES_UNRESOLVED',
				uuidAttribute: 'ldUuid',
				address: 'ld:IED9/LD1',
				resolved: 'none',
			},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const goose = { tagName: 'GSEControl', id: 'gc7' } as Scl.Ref<Scl.ElementsOf>
		const subscriber = await source.transaction(async function addSubscriber(tx) {
			return tx.any.addChild(goose, {
				tagName: 'IEDName',
				attributes: { ldInst: 'LD1' },
				value: 'IED8',
			})
		})
		const refused = await refusalOf({
			run: () =>
				source.transaction(async function editSubscriber(tx) {
					await tx.any.update(subscriber, testCase.edited)
				}),
		})
		const meta = refused?.meta as
			| { uuidAttribute?: unknown; address?: unknown; resolved?: unknown }
			| undefined
		expect({
			key: refused?.key,
			uuidAttribute: meta?.uuidAttribute,
			address: meta?.address,
			resolved: meta?.resolved,
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
