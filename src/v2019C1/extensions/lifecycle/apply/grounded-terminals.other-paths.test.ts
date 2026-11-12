/// <reference types="vite/client" />
import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type {
	LifecycleScenario,
	LifecycleVerb,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The fixtures of this folder, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

/** The case's document is the project; the template is opened beside it and placed or updated by `verb`. */
type PlacementTestCase = SclTest.BaseXmlTestCase & {
	templateXml: string
	verb: LifecycleVerb
	scenario: LifecycleScenario
	ref: Scl.Ref<Scl.ElementsOf>
	anchor: Scl.Ref<Scl.ElementsOf>
}

/** A terminal on the predefined grounded node names the grounded node of its level as placed, whatever places it. */
describe('apply - a terminal on the predefined grounded node, placed by an update or with a function', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		'a placed bay, its template gaining an earthing switch on the grounded node → the terminal names the grounded node of the placed bay':
			{
				verb: 'ssd',
				scenario: 'template',
				ref: { tagName: 'Substation', id: 'substation-s' },
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
				sourceXml: FIXTURES['./fixtures/bay-gaining-an-earthing-switch-placed.xml'],
				templateXml: FIXTURES['./fixtures/bay-gaining-an-earthing-switch.xml'],
				expectedQueries: [
					'//default:ConductingEquipment[@name="QC1"]/default:Terminal[@connectivityNode="S1/15kV/Bay_MV/grounded"][@substationName="S1"][@voltageLevelName="15kV"][@bayName="Bay_MV"]',
				],
				unexpectedQueries: ['//default:Terminal[contains(@connectivityNode, "TEMPLATE")]'],
			},
		"an application placed in a bay, its function's earthing switch on the grounded node → the terminal names the grounded node of that bay":
			{
				verb: 'asd',
				scenario: 'instantiate',
				ref: { tagName: 'Application', id: 'application-s' },
				anchor: { tagName: 'Bay', id: 'bay-t' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="asd">
						<Header id="asd-header" uuid="asd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<Private type="eIEC61850-6-100" ${id}="private-s">
								<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-source-uuid" ${id}="application-s">
									<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
										<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="function-ref-s"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
								</eIEC61850-6-100:Application>
							</Private>
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Prot" uuid="function-source-uuid" ${id}="function-s">
										<ConductingEquipment name="QC1" type="DIS" ${id}="earthing-switch-s">
											<!-- no ConnectivityNode "grounded": the node is predefined -->
											<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/TEMPLATE/grounded" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="TEMPLATE" cNodeName="grounded" ${id}="terminal-grounded-s"/>
										</ConductingEquipment>
									</Function>
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
								<Bay name="B1" ${id}="bay-t"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:ConductingEquipment[@name="QC1"]/default:Terminal[@connectivityNode="S1/15kV/B1/grounded"][@bayName="B1"]',
				],
				unexpectedQueries: ['//default:Terminal[contains(@connectivityNode, "TEMPLATE")]'],
			},
		'a function placed in a bay, its earthing switch on the grounded node → the terminal names the grounded node of that bay':
			{
				verb: 'fsd',
				scenario: 'instantiate',
				ref: { tagName: 'Function', id: 'function-s' },
				anchor: { tagName: 'Bay', id: 'bay-t' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Prot" uuid="function-source-uuid" ${id}="function-s">
										<ConductingEquipment name="QC1" type="DIS" ${id}="earthing-switch-s">
											<!-- no ConnectivityNode "grounded": the node is predefined -->
											<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/TEMPLATE/grounded" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="TEMPLATE" cNodeName="grounded" ${id}="terminal-grounded-s"/>
										</ConductingEquipment>
									</Function>
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
								<Bay name="B1" ${id}="bay-t"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:ConductingEquipment[@name="QC1"]/default:Terminal[@connectivityNode="S1/15kV/B1/grounded"][@bayName="B1"]',
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
			verb: testCase.verb,
			scenario: testCase.scenario,
			sourceQuery: template.query,
			ref: testCase.ref,
			anchor: testCase.anchor,
		} as Parameters<typeof report>[1]
		const reported = await report(source.query, placement)
		await source.transaction(async function write(tx) {
			await apply(tx, { ...placement, report: reported, resolution: { decisions: new Map() } })
		})
		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
