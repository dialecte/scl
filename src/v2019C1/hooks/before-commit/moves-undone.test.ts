import anIedAndABay from './fixtures/an-ied-with-two-logical-devices-and-a-bay.xml?raw'
import twoSubstationsAndALine from './fixtures/two-substations-and-a-line.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('a move undone in the same transaction leaves nothing to follow', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		element: Scl.Ref<Scl.ElementsOf>
		away: Scl.Ref<Scl.ElementsOf>
		back: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// PTRC1 goes to LD2 and back to LD1: no move is left for the commit to refuse
		'a logical node moved to another logical device and back → committed unchanged': {
			sourceXml: anIedAndABay,
			element: { tagName: 'LN', id: 'ptrc1' },
			away: { tagName: 'LDevice', id: 'ld2' },
			back: { tagName: 'LDevice', id: 'ld1' },
			expectedQueries: [
				'//default:LDevice[@inst="LD1"]/default:LN[@lnClass="PTRC"][@inst="1"]/default:DOI[@name="Op"]',
			],
			unexpectedQueries: ['//default:LDevice[@inst="LD2"]/default:LN[@lnClass="PTRC"]'],
		},
		// QA1 goes to S2 and back to B1 of S1: its terminal t-inner names L1 of S1 all along
		'QA1 moved from S1 to S2 and back → its terminal kept': {
			sourceXml: twoSubstationsAndALine,
			element: { tagName: 'ConductingEquipment', id: 'qa1' },
			away: { tagName: 'Bay', id: 'b5' },
			back: { tagName: 'Bay', id: 'b1' },
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:ConductingEquipment[@name="QA1"]/default:Terminal[@cNodeUuid="n1"]/default:Private[@type="vendor-x"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveAwayAndBack(tx) {
			await tx.any.move(testCase.element, { parent: testCase.away })
			await tx.any.move(testCase.element, { parent: testCase.back })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
