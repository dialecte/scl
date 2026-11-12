import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleVerb } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The case's document is the project; the template is opened beside it and placed by `verb` under `anchor`. */
type PlacementTestCase = SclTest.BaseXmlTestCase & {
	templateXml: string
	verb: LifecycleVerb
	ref: Scl.Ref<Scl.ElementsOf>
	anchor: Scl.Ref<Scl.ElementsOf>
}

/**
 * A terminal of a placed function's equipment naming a node the template does not hold would name nothing in the
 * project: it is not written, whatever the verb placing the function.
 */
describe('apply - a reference of a placed function naming what the template does not hold', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		'a function of a placed bay holding a breaker on a node of a bay the template does not hold → the breaker written, not its terminal':
			{
				verb: 'ssd',
				ref: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<Scl.ElementsOf>,
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<Scl.ElementsOf>,
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="Bay_MV" ${id}="bay-s">
									<Function name="Prot" uuid="function-source-uuid" ${id}="function-s">
										<ConductingEquipment name="CBR1" type="CBR" ${id}="breaker-s">
											<!-- Bay_HV is not in the template: this path names nothing it holds -->
											<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/Bay_HV/L2" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_HV" cNodeName="L2" ${id}="terminal-s"/>
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
					'//default:Function[@name="Prot"]/default:ConductingEquipment[@name="CBR1"]',
				],
				unexpectedQueries: ['//default:Terminal'],
			},
		'an application composing a function holding a breaker on a node of a bay the template does not hold → the breaker written, not its terminal':
			{
				verb: 'asd',
				ref: { tagName: 'Application', id: 'application-s' } as Scl.Ref<Scl.ElementsOf>,
				anchor: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<Scl.ElementsOf>,
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
										<ConductingEquipment name="CBR1" type="CBR" ${id}="breaker-s">
											<!-- Bay_HV is not in the template: this path names nothing it holds -->
											<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/Bay_HV/L2" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_HV" cNodeName="L2" ${id}="terminal-s"/>
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
					'//default:Function[@name="Prot"]/default:ConductingEquipment[@name="CBR1"]',
				],
				unexpectedQueries: ['//default:Terminal'],
			},
		'a function template holding a breaker on a node of a bay no file of it holds → the breaker written, not its terminal':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'function-s' } as Scl.Ref<Scl.ElementsOf>,
				anchor: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<Scl.ElementsOf>,
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Prot" uuid="function-source-uuid" ${id}="function-s">
										<ConductingEquipment name="CBR1" type="CBR" ${id}="breaker-s">
											<!-- Bay_HV is not in the template: this path names nothing it holds -->
											<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/Bay_HV/L2" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_HV" cNodeName="L2" ${id}="terminal-s"/>
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
					'//default:Function[@name="Prot"]/default:ConductingEquipment[@name="CBR1"]',
				],
				unexpectedQueries: ['//default:Terminal'],
			},
	}

	async function act(params: SclTest.ActParams<PlacementTestCase>): Promise<SclTest.ActResult> {
		const { testCase, project, source } = params
		// the template names a node it does not hold: that is the case
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
			allowIncoherentReferences:
				"the breaker's terminal names a node of a bay the template does not hold",
		})
		const placement = {
			verb: testCase.verb,
			scenario: 'instantiate',
			sourceQuery: template.query,
			ref: testCase.ref,
			anchor: testCase.anchor,
		} as Parameters<typeof report>[1]
		const reported = await report(source.query, placement)
		await source.transaction(async function write(tx) {
			await apply(tx, { ...placement, report: reported })
		})
		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
