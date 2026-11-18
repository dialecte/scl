import anIedAndABay from './fixtures/an-ied-with-two-logical-devices-and-a-bay.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('the commit refuses a move whose subtree references name by its place, which a move does not follow yet', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		element: Scl.Ref<Scl.ElementsOf>
		parent: Scl.Ref<Scl.ElementsOf>
		expected: { key: string | undefined; meta: unknown }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// PTRC1 is in LD1; tuple references name a logical node by its logical device
		'a logical node moved to another logical device → refused, the IED unchanged': {
			sourceXml: anIedAndABay,
			element: { tagName: 'LN', id: 'ptrc1' },
			parent: { tagName: 'LDevice', id: 'ld2' },
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: {
					moved: { tagName: 'LN', id: 'ptrc1' },
					parent: { tagName: 'LDevice', id: 'ld2' },
				},
			},
			expectedQueries: [
				'//default:LDevice[@inst="LD1"]/default:LN[@lnClass="PTRC"][@inst="1"]/default:DOI[@name="Op"]',
			],
			unexpectedQueries: ['//default:LDevice[@inst="LD2"]/default:LN[@lnClass="PTRC"]'],
		},
		// Op is a data instance of PTRC1
		'a data instance moved to another logical node → refused': {
			sourceXml: anIedAndABay,
			element: { tagName: 'DOI', id: 'op' },
			parent: { tagName: 'LN', id: 'xcbr1' },
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: { moved: { tagName: 'DOI', id: 'op' }, parent: { tagName: 'LN', id: 'xcbr1' } },
			},
			expectedQueries: ['//default:LN[@lnClass="PTRC"]/default:DOI[@name="Op"]'],
			unexpectedQueries: ['//default:LN[@lnClass="XCBR"]/default:DOI'],
		},
		// DS1 is in the LLN0 of LD1; control blocks name a data set by their own logical node
		'a data set moved to the LLN0 of another logical device → refused': {
			sourceXml: anIedAndABay,
			element: { tagName: 'DataSet', id: 'ds1' },
			parent: { tagName: 'LN0', id: 'ld2-lln0' },
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: {
					moved: { tagName: 'DataSet', id: 'ds1' },
					parent: { tagName: 'LN0', id: 'ld2-lln0' },
				},
			},
			expectedQueries: ['//default:LDevice[@inst="LD1"]/default:LN0/default:DataSet[@name="DS1"]'],
			unexpectedQueries: ['//default:LDevice[@inst="LD2"]//default:DataSet'],
		},
		// LD2 of A goes to the server of B; tuple references name a logical device by its IED
		'a logical device moved to the server of another IED → refused': {
			sourceXml: anIedAndABay,
			element: { tagName: 'LDevice', id: 'ld2' },
			parent: { tagName: 'Server', id: 'server-b' },
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: {
					moved: { tagName: 'LDevice', id: 'ld2' },
					parent: { tagName: 'Server', id: 'server-b' },
				},
			},
			expectedQueries: ['//default:IED[@name="A"]//default:LDevice[@inst="LD2"]'],
			unexpectedQueries: ['//default:IED[@name="B"]//default:LDevice[@inst="LD2"]'],
		},
		// the address of A's GOOSE gcb1 goes to the connection of B: a GSE names its IED by the connection holding it
		'a GOOSE address moved to the connected access point of another IED → refused': {
			sourceXml: anIedAndABay,
			element: { tagName: 'GSE', id: 'gse1' },
			parent: { tagName: 'ConnectedAP', id: 'connected-ap-b' },
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: {
					moved: { tagName: 'GSE', id: 'gse1' },
					parent: { tagName: 'ConnectedAP', id: 'connected-ap-b' },
				},
			},
			expectedQueries: ['//default:ConnectedAP[@iedName="A"]/default:GSE[@cbName="gcb1"]'],
			unexpectedQueries: ['//default:ConnectedAP[@iedName="B"]/default:GSE'],
		},
		// AP1 of A, holding its server and devices, goes to the IED B
		'an access point moved to another IED → refused': {
			sourceXml: anIedAndABay,
			element: { tagName: 'AccessPoint', id: 'ap1' },
			parent: { tagName: 'IED', id: 'ied-b' },
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: {
					moved: { tagName: 'AccessPoint', id: 'ap1' },
					parent: { tagName: 'IED', id: 'ied-b' },
				},
			},
			expectedQueries: ['//default:IED[@name="A"]/default:AccessPoint[@name="AP1"]/default:Server'],
			unexpectedQueries: ['//default:IED[@name="B"]//default:LDevice[@inst="LD1"]'],
		},
		// gcb1 is sent from LLN0 of LD1; GSE and inputs name it by its logical device
		'a GOOSE control block moved to the LLN0 of another logical device → refused': {
			sourceXml: anIedAndABay,
			element: { tagName: 'GSEControl', id: 'gcb1' },
			parent: { tagName: 'LN0', id: 'ld2-lln0' },
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: {
					moved: { tagName: 'GSEControl', id: 'gcb1' },
					parent: { tagName: 'LN0', id: 'ld2-lln0' },
				},
			},
			expectedQueries: [
				'//default:LDevice[@inst="LD1"]/default:LN0/default:GSEControl[@name="gcb1"]',
			],
			unexpectedQueries: ['//default:LDevice[@inst="LD2"]//default:GSEControl'],
		},
		// the ServerAt of B's AP2 names AP1 of the IED it sits in; AP3 of A holds nothing
		'a served access point moved to an access point of another IED → refused': {
			sourceXml: anIedAndABay,
			element: { tagName: 'ServerAt', id: 'server-at' },
			parent: { tagName: 'AccessPoint', id: 'ap3' },
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: {
					moved: { tagName: 'ServerAt', id: 'server-at' },
					parent: { tagName: 'AccessPoint', id: 'ap3' },
				},
			},
			expectedQueries: [
				'//default:IED[@name="B"]/default:AccessPoint[@name="AP2"]/default:ServerAt[@apName="AP1"]',
			],
			unexpectedQueries: ['//default:AccessPoint[@name="AP3"]/default:ServerAt'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const refused = await source
			.transaction(async function moveOutsideTheSections(tx) {
				await tx.any.move(testCase.element, { parent: testCase.parent })
			})
			.then(function committed() {
				return undefined
			})
			.catch(function refusal(error: unknown) {
				const dialecteError = toDialecteError(error)
				return { key: dialecteError?.key, meta: dialecteError?.meta }
			})
		expect(refused).toEqual(testCase.expected)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
