import twoSubstationsAndALine from './fixtures/two-substations-and-a-line.xml?raw'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('a terminal a move leaves naming a node its substation may not name is removed', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		element: Scl.Ref<Scl.ElementsOf>
		parent: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// QA1 leaves S1 for S2; its terminal t-inner names L1, which stays in S1
		'QA1 moved from S1 to S2 → its terminal naming L1 removed, with what it holds': {
			sourceXml: twoSubstationsAndALine,
			element: { tagName: 'ConductingEquipment', id: 'qa1' },
			parent: { tagName: 'Bay', id: 'b5' },
			expectedQueries: [
				'//default:Bay[@name="B5"]/default:ConductingEquipment[@name="QA1"]',
				// the other terminals naming L1 stay: t-outer in S1, t-line in LN1
				'//default:ConductingEquipment[@name="QA2"]/default:Terminal[@cNodeUuid="n1"][@connectivityNode="S1/VL1/B1/L1"]',
				'//default:Line[@name="LN1"]//default:Terminal[@cNodeUuid="n1"][@connectivityNode="S1/VL1/B1/L1"]',
			],
			unexpectedQueries: [
				'//default:ConductingEquipment[@name="QA1"]/default:Terminal',
				'//default:Private[@type="vendor-x"]',
			],
		},
		// B1, holding L1 and QA1, leaves S1 for S2; t-outer (in S1) and t-line (in LN1) name L1
		'B1 moved from S1 to S2 → the S1 terminal naming L1 removed, the line terminal and the one inside B1 follow it':
			{
				sourceXml: twoSubstationsAndALine,
				element: { tagName: 'Bay', id: 'b1' },
				parent: { tagName: 'VoltageLevel', id: 'vl5' },
				expectedQueries: [
					'//default:ConductingEquipment[@name="QA1"]/default:Terminal[@cNodeUuid="n1"][@connectivityNode="S2/VL5/B1/L1"][@substationName="S2"]',
					'//default:Line[@name="LN1"]//default:Terminal[@cNodeUuid="n1"][@connectivityNode="S2/VL5/B1/L1"][@substationName="S2"][@voltageLevelName="VL5"]',
				],
				unexpectedQueries: ['//default:ConductingEquipment[@name="QA2"]/default:Terminal'],
			},
		// L1 leaves B1 for the line LN1: t-inner and t-outer are terminals of S1, t-line one of LN1
		'L1 moved from S1 into LN1 → the S1 terminals naming it removed, the line terminal follows it':
			{
				sourceXml: twoSubstationsAndALine,
				element: { tagName: 'ConnectivityNode', id: 'l1' },
				parent: { tagName: 'Line', id: 'ln1' },
				expectedQueries: [
					'//default:Line[@name="LN1"]/default:ConnectivityNode[@name="L1"][@pathName="LN1/L1"]',
					'//default:ConductingEquipment[@name="QL1"]/default:Terminal[@cNodeUuid="n1"][@connectivityNode="LN1/L1"][@lineName="LN1"][not(@substationName)]',
				],
				unexpectedQueries: [
					'//default:ConductingEquipment[@name="QA1"]/default:Terminal',
					'//default:ConductingEquipment[@name="QA2"]/default:Terminal',
				],
			},
		// SA and SB are substations of the process P1; QA1's terminal names LA of SA
		'QA1 moved between two substations of one process → its terminal naming a node of the first removed':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Process ${id}="p1" name="P1">
						<Substation ${id}="sa" name="SA">
							<VoltageLevel ${id}="vla" name="VLA">
								<Bay ${id}="ba" name="BA">
									<ConductingEquipment ${id}="qa1" name="QA1" type="CBR">
										<Terminal ${id}="t-qa1" connectivityNode="P1/SA/VLA/BA/LA" processName="P1" voltageLevelName="VLA" bayName="BA" cNodeName="LA" cNodeUuid="na" />
									</ConductingEquipment>
									<ConnectivityNode ${id}="la" name="LA" pathName="P1/SA/VLA/BA/LA" uuid="na" />
								</Bay>
							</VoltageLevel>
						</Substation>
						<Substation ${id}="sb" name="SB">
							<VoltageLevel ${id}="vlb" name="VLB">
								<Bay ${id}="bb" name="BB" />
							</VoltageLevel>
						</Substation>
					</Process>
				</SCL>
			`,
				element: { tagName: 'ConductingEquipment', id: 'qa1' },
				parent: { tagName: 'Bay', id: 'bb' },
				expectedQueries: ['//default:Bay[@name="BB"]/default:ConductingEquipment[@name="QA1"]'],
				unexpectedQueries: ['//default:Terminal'],
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
