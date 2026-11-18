import anIedAndABay from './fixtures/an-ied-with-two-logical-devices-and-a-bay.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('a move holding nothing a move does not follow commits wherever it goes', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		element: Scl.Ref<Scl.ElementsOf>
		parent: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// the Text of PTRC1 leaves the IED for the bay B1, which holds no Text
		'a text moved from a logical node into a bay → committed': {
			sourceXml: anIedAndABay,
			element: { tagName: 'Text', id: 'ptrc1-text' },
			parent: { tagName: 'Bay', id: 'b1' },
			expectedQueries: ['//default:Bay[@name="B1"]/default:Text[text()="trip"]'],
			unexpectedQueries: ['//default:LN[@lnClass="PTRC"]/default:Text'],
		},
		// the Text of F1 leaves the bay for the logical node XCBR1, which holds no Text
		'a text moved from a function into a logical node → committed': {
			sourceXml: anIedAndABay,
			element: { tagName: 'Text', id: 'f1-text' },
			parent: { tagName: 'LN', id: 'xcbr1' },
			expectedQueries: ['//default:LN[@lnClass="XCBR"]/default:Text[text()="interlocking"]'],
			unexpectedQueries: ['//default:Function[@name="F1"]/default:Text'],
		},
		// the connection of A's AP1, with its GOOSE address, goes from N1 to N2: it names its IED and access point outright
		'a connected access point moved to another subnetwork → committed': {
			sourceXml: anIedAndABay,
			element: { tagName: 'ConnectedAP', id: 'connected-ap' },
			parent: { tagName: 'SubNetwork', id: 'n2' },
			expectedQueries: [
				'//default:SubNetwork[@name="N2"]/default:ConnectedAP[@iedName="A"][@apName="AP1"]/default:GSE[@cbName="gcb1"]',
			],
			unexpectedQueries: ['//default:SubNetwork[@name="N1"]/default:ConnectedAP[@iedName="A"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function move(tx) {
			await tx.any.move(testCase.element, { parent: testCase.parent })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
