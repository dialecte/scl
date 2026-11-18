import twoSubstationsAndALine from './fixtures/two-substations-and-a-line.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('a terminal a move leaves naming a node its substation may name, or already named one it may not, is kept', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		element: Scl.Ref<Scl.ElementsOf>
		parent: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// t-cross already names L5 of S2 from S1; QA4 moves to another bay of S1
		'QA4, whose terminal names a node of S2 already, moved within S1 → its terminal untouched': {
			sourceXml: twoSubstationsAndALine,
			element: { tagName: 'ConductingEquipment', id: 'qa4' },
			parent: { tagName: 'Bay', id: 'b2' },
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:ConductingEquipment[@name="QA4"]/default:Terminal[@cNodeUuid="n5"][@connectivityNode="S2/VL5/B5/L5"]',
			],
		},
		// QE1's terminal names the grounded node, which no substation holds
		'QE1, whose terminal is grounded, moved from S1 to S2 → its terminal kept': {
			sourceXml: twoSubstationsAndALine,
			element: { tagName: 'ConductingEquipment', id: 'qe1' },
			parent: { tagName: 'Bay', id: 'b5' },
			expectedQueries: [
				'//default:Bay[@name="B5"]/default:ConductingEquipment[@name="QE1"]/default:Terminal[@cNodeName="grounded"]',
			],
		},
		// QA2's terminal t-outer names L1 of S1; a terminal of a line may name a node of a substation
		'QA2 moved from S1 into the line LN1 → its terminal naming L1 of S1 kept': {
			sourceXml: twoSubstationsAndALine,
			element: { tagName: 'ConductingEquipment', id: 'qa2' },
			parent: { tagName: 'Line', id: 'ln1' },
			expectedQueries: [
				'//default:Line[@name="LN1"]/default:ConductingEquipment[@name="QA2"]/default:Terminal[@cNodeUuid="n1"][@connectivityNode="S1/VL1/B1/L1"][@substationName="S1"]',
			],
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
