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

/** The case's document is the project; the template is opened beside it and placed by `verb` in the project's bay. */
type PlacementTestCase = SclTest.BaseXmlTestCase & {
	templateXml: string
	verb: LifecycleVerb
	ref: Scl.Ref<Scl.ElementsOf>
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" uuid="bay-uuid" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/**
 * A reference of what a placement places naming an element of the template it does not place would name nothing in the
 * project: it is not written, the rest of its element is.
 */
describe('apply - a reference by uuid to what the placement does not place', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		'one function placed, a variable it holds applying to it and to another function → its application to the function written, not the other':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'prot-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<Private type="eIEC61850-6-100" ${id}="prot-private-s">
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source-uuid" ${id}="pickup-prot-s"/>
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" elementUuid="ctrl-source-uuid" ${id}="pickup-ctrl-s"/>
											</eIEC61850-6-100:Variable>
										</Private>
									</Function>
									<!-- the other function: not placed -->
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedQueries: [
					'//default:Function[@name="Prot"]/default:Private/v2019C1:Variable[@name="PICKUP"]/v2019C1:VariableApplyTo[@element="S1/V1/B1/Prot"]',
				],
				unexpectedQueries: ['//v2019C1:VariableApplyTo[contains(@element, "Ctrl")]'],
			},
		'one function placed, a variable it holds applying only to another function → the variable not written':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'prot-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<Private type="eIEC61850-6-100" ${id}="prot-private-s">
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" elementUuid="ctrl-source-uuid" ${id}="pickup-ctrl-s"/>
											</eIEC61850-6-100:Variable>
										</Private>
									</Function>
									<!-- the other function: not placed -->
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedQueries: ['//default:Function[@name="Prot"]'],
				unexpectedQueries: ['//v2019C1:Variable'],
			},
		'one function placed, a variable it holds applying to it and to the bay it lands on → both applications written, the bay named as placed':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'prot-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" uuid="bay-source-uuid" ${id}="bay-s">
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<Private type="eIEC61850-6-100" ${id}="prot-private-s">
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source-uuid" ${id}="pickup-prot-s"/>
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE" elementUuid="bay-source-uuid" ${id}="pickup-bay-s"/>
											</eIEC61850-6-100:Variable>
										</Private>
									</Function>
									<!-- the other function: not placed -->
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedQueries: [
					'//default:Function[@name="Prot"]/default:Private/v2019C1:Variable[@name="PICKUP"]/v2019C1:VariableApplyTo[@element="S1/V1/B1/Prot"]',
					'//default:Function[@name="Prot"]/default:Private/v2019C1:Variable[@name="PICKUP"]/v2019C1:VariableApplyTo[@element="S1/V1/B1"][@elementUuid="bay-uuid"]',
				],
				unexpectedQueries: ['//v2019C1:VariableApplyTo[contains(@element, "TEMPLATE")]'],
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
			scenario: 'instantiate',
			sourceQuery: template.query,
			ref: testCase.ref,
			anchor: { tagName: 'Bay', id: 'bay-t' },
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
