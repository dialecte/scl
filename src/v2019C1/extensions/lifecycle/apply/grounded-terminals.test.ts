import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The case's document is the project; the template is opened beside it and placed under its voltage level. */
type PlacementTestCase = SclTest.BaseXmlTestCase & { templateXml: string }

/**
 * A terminal on the predefined grounded node, which no file declares, names it by the path of its bay: once placed,
 * by the path of the bay it was placed as, never the template's.
 */
describe('apply - a terminal on the predefined grounded node', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		'an earthing switch of a placed bay on its grounded node → the terminal names the grounded node of the placed bay':
			{
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="Bay_MV" ${id}="bay-s">
									<ConductingEquipment name="QC1" type="DIS" ${id}="earthing-switch-s">
										<!-- no ConnectivityNode "grounded": the node is predefined -->
										<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/Bay_MV/grounded" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_MV" cNodeName="grounded" ${id}="terminal-grounded-s"/>
									</ConductingEquipment>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<Substation name="S1" ${id}="substation-t">
							<VoltageLevel name="15kV" ${id}="voltage-level-t"/>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:Terminal[@name="T1"][@connectivityNode="S1/15kV/Bay_MV/grounded"][@substationName="S1"][@voltageLevelName="15kV"][@bayName="Bay_MV"][@cNodeName="grounded"]',
				],
				unexpectedQueries: ['//default:Terminal[contains(@connectivityNode, "TEMPLATE")]'],
			},
		'an earthing switch of a bay placed beside one of its name on its grounded node → the terminal names the grounded node of the bay as numbered':
			{
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="Bay_MV" ${id}="bay-s">
									<ConductingEquipment name="QC1" type="DIS" ${id}="earthing-switch-s">
										<!-- no ConnectivityNode "grounded": the node is predefined -->
										<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/Bay_MV/grounded" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_MV" cNodeName="grounded" ${id}="terminal-grounded-s"/>
									</ConductingEquipment>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<Substation name="S1" ${id}="substation-t">
							<VoltageLevel name="15kV" ${id}="voltage-level-t">
								<!-- a bay of the template's name: the placed one is numbered -->
								<Bay name="Bay_MV" ${id}="bay-t"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:Bay[@name="Bay_MV_1"]//default:Terminal[@name="T1"][@connectivityNode="S1/15kV/Bay_MV_1/grounded"][@bayName="Bay_MV_1"]',
				],
				unexpectedQueries: ['//default:Terminal[contains(@connectivityNode, "TEMPLATE")]'],
			},
	}

	async function act(params: SclTest.ActParams<PlacementTestCase>): Promise<SclTest.ActResult> {
		const { testCase, project, source } = params
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
		})
		const placement = {
			verb: 'ssd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: template.query,
			ref: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>,
			anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
		}
		const reported = await report(source.query, placement)
		await source.transaction(async function write(tx) {
			await apply(tx, { ...placement, report: reported })
		})
		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
