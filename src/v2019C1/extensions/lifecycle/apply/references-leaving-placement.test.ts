import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const lifecycleTarget = {
	verb: 'ssd' as const,
	scenario: 'instantiate' as const,
	ref: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>,
	anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
}

type PlacementTestCase = SclTest.BaseXmlTestCase & { targetXml: string }

/**
 * A reference of the placed content naming an element the placement does not place (the template does not hold it):
 * it would name nothing in the project, so it is not written.
 */
describe('apply - a reference of the placed content naming what the template does not hold', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		'a breaker terminal on a node of a bay the template does not hold → the terminal is not written, its other terminal is':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="Bay_MV" ${id}="bay-s">
									<ConductingEquipment name="CBR1" type="CBR" ${id}="breaker-s">
										<!-- Bay_HV is not in the template: this path names nothing it holds -->
										<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/Bay_HV/L2" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_HV" cNodeName="L2" ${id}="terminal-outside-s"/>
										<Terminal name="T2" connectivityNode="TEMPLATE/TEMPLATE/Bay_MV/L1" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_MV" cNodeName="L1" ${id}="terminal-inside-s"/>
									</ConductingEquipment>
									<ConnectivityNode name="L1" pathName="TEMPLATE/TEMPLATE/Bay_MV/L1" ${id}="node-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<Substation name="S1" ${id}="substation-t">
							<VoltageLevel name="15kV" ${id}="voltage-level-t"/>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:Bay[@name="Bay_MV"]/default:ConductingEquipment[@name="CBR1"]',
					'//default:ConductingEquipment[@name="CBR1"]/default:Terminal[@name="T2"][@connectivityNode="S1/15kV/Bay_MV/L1"]',
				],
				unexpectedQueries: [
					'//default:Terminal[@name="T1"]',
					'//default:Terminal[contains(@connectivityNode, "TEMPLATE")]',
				],
			},
		'an earthing switch terminal on the predefined grounded node, which no file declares → the terminal is written':
			{
				sourceXml: /* xml */ `
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
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<Substation name="S1" ${id}="substation-t">
							<VoltageLevel name="15kV" ${id}="voltage-level-t"/>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:ConductingEquipment[@name="QC1"]/default:Terminal[@name="T1"][@cNodeName="grounded"]',
				],
			},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<PlacementTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		const placement = { ...lifecycleTarget, sourceQuery: source.query }
		const reported = await report(target.query, placement)
		await target.transaction(async function write(tx) {
			await apply(tx, { ...placement, report: reported })
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
