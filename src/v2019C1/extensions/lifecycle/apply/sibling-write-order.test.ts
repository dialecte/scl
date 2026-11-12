import { apply } from './apply'

import { describe } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const substationRef = { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>
const anchor = { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t"/>
	</SCL>
`

/**
 * A store lists records by their id, and the ids of a document are new on every import: siblings of one tag written
 * in the order such a list gives would come out in another order on every run. In every template below the ids of
 * two siblings sort the other way round from the document, so a placement writing them in id order fails the case.
 */
describe('apply - siblings of one tag are written in the order of the template', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase & { targetXml: string }> = {
		'two voltage levels, the second of the lower id → written first VA, then VB': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
					<Substation name="SUB" ${id}="substation-s">
						<VoltageLevel name="VA" ${id}="voltage-level-z">
							<Bay name="BA" ${id}="bay-z"/>
						</VoltageLevel>
						<VoltageLevel name="VB" ${id}="voltage-level-a">
							<Bay name="BB" ${id}="bay-a"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			targetXml,
			expectedQueries: [
				'//default:Substation[@name="SUB"]/default:VoltageLevel[1][@name="VA"]',
				'//default:Substation[@name="SUB"]/default:VoltageLevel[2][@name="VB"]',
			],
		},

		'two applications in a bay, the second of the lower id → written first A1, then A2': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
					<Substation name="SUB" ${id}="substation-s">
						<VoltageLevel name="VA" ${id}="voltage-level-s">
							<Bay name="BA" ${id}="bay-s">
								<Private type="eIEC61850-6-100" ${id}="private-s">
									<eIEC61850-6-100:Application name="A1" type="DCS" uuid="application-1-uuid" ${id}="application-z"/>
									<eIEC61850-6-100:Application name="A2" type="DCS" uuid="application-2-uuid" ${id}="application-a"/>
								</Private>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			targetXml,
			expectedQueries: [
				'//default:Bay[@name="BA"]/default:Private/v2019C1:Application[1][@name="A1"]',
				'//default:Bay[@name="BA"]/default:Private/v2019C1:Application[2][@name="A2"]',
			],
		},

		'two functions in a bay, the second of the lower id → written first F1, then F2': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
					<Substation name="SUB" ${id}="substation-s">
						<VoltageLevel name="VA" ${id}="voltage-level-s">
							<Bay name="BA" ${id}="bay-s">
								<Function name="F1" uuid="function-1-uuid" ${id}="function-z"/>
								<Function name="F2" uuid="function-2-uuid" ${id}="function-a"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			targetXml,
			expectedQueries: [
				'//default:Bay[@name="BA"]/default:Function[1][@name="F1"]',
				'//default:Bay[@name="BA"]/default:Function[2][@name="F2"]',
			],
		},

		'two categories classifying the subfunctions of one function, the second of the lower id → written first C1, then C2':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="SUB" ${id}="substation-s">
							<VoltageLevel name="VA" ${id}="voltage-level-s">
								<Bay name="BA" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:FunctionCategory name="C1" uuid="category-1-uuid" ${id}="category-z">
											<eIEC61850-6-100:FunctionCatRef function="SUB/VA/BA/F1/S1" functionUuid="subfunction-1-uuid" ${id}="category-ref-z"/>
										</eIEC61850-6-100:FunctionCategory>
										<eIEC61850-6-100:FunctionCategory name="C2" uuid="category-2-uuid" ${id}="category-a">
											<eIEC61850-6-100:FunctionCatRef function="SUB/VA/BA/F1/S2" functionUuid="subfunction-2-uuid" ${id}="category-ref-a"/>
										</eIEC61850-6-100:FunctionCategory>
									</Private>
									<Function name="F1" uuid="function-1-uuid" ${id}="function-s">
										<!-- the subfunctions too: their ids sort the other way round -->
										<SubFunction name="S1" uuid="subfunction-1-uuid" ${id}="subfunction-z"/>
										<SubFunction name="S2" uuid="subfunction-2-uuid" ${id}="subfunction-a"/>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml,
				expectedQueries: [
					'//default:Bay[@name="BA"]/default:Private/v2019C1:FunctionCategory[1][@name="C1"]',
					'//default:Bay[@name="BA"]/default:Private/v2019C1:FunctionCategory[2][@name="C2"]',
				],
			},

		'two variables applying to one function, the second of the lower id → written first V1, then V2':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="SUB" ${id}="substation-s">
							<Private type="eIEC61850-6-100" ${id}="private-s">
								<eIEC61850-6-100:Variable name="V1" uuid="variable-1-uuid" ${id}="variable-z">
									<eIEC61850-6-100:VariableApplyTo element="SUB/VA/BA/F1" elementUuid="function-1-uuid" ${id}="apply-to-z"/>
								</eIEC61850-6-100:Variable>
								<eIEC61850-6-100:Variable name="V2" uuid="variable-2-uuid" ${id}="variable-a">
									<eIEC61850-6-100:VariableApplyTo element="SUB/VA/BA/F1" elementUuid="function-1-uuid" ${id}="apply-to-a"/>
								</eIEC61850-6-100:Variable>
							</Private>
							<VoltageLevel name="VA" ${id}="voltage-level-s">
								<Bay name="BA" ${id}="bay-s">
									<Function name="F1" uuid="function-1-uuid" ${id}="function-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml,
				expectedQueries: [
					'//default:Substation[@name="SUB"]/default:Private/v2019C1:Variable[1][@name="V1"]',
					'//default:Substation[@name="SUB"]/default:Private/v2019C1:Variable[2][@name="V2"]',
				],
			},

		'an application composing two functions, the second of the lower id → written first F1, then F2':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="SUB" ${id}="substation-s">
							<VoltageLevel name="VA" ${id}="voltage-level-s">
								<Bay name="BA" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:Application name="A1" type="DCS" uuid="application-1-uuid" ${id}="application-s">
											<!-- the references too: their ids sort the other way round -->
											<eIEC61850-6-100:FunctionRef function="SUB/VA/BA/F1" functionUuid="function-1-uuid" ${id}="function-ref-z"/>
											<eIEC61850-6-100:FunctionRef function="SUB/VA/BA/F2" functionUuid="function-2-uuid" ${id}="function-ref-a"/>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="F1" uuid="function-1-uuid" ${id}="function-z"/>
									<Function name="F2" uuid="function-2-uuid" ${id}="function-a"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml,
				expectedQueries: [
					'//default:Bay[@name="BA"]/default:Function[1][@name="F1"]',
					'//default:Bay[@name="BA"]/default:Function[2][@name="F2"]',
				],
			},

		'a role referring to two variables, the second of the lower id → written first V1, then V2': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
					<Substation name="SUB" ${id}="substation-s">
						<VoltageLevel name="VA" ${id}="voltage-level-s">
							<Bay name="BA" ${id}="bay-s">
								<Private type="eIEC61850-6-100" ${id}="private-s">
									<eIEC61850-6-100:Variable name="V1" uuid="variable-1-uuid" ${id}="variable-z">
										<eIEC61850-6-100:VariableApplyTo element="SUB/VA/BA/F1" elementUuid="function-1-uuid" ${id}="apply-to-z"/>
									</eIEC61850-6-100:Variable>
									<eIEC61850-6-100:Variable name="V2" uuid="variable-2-uuid" ${id}="variable-a">
										<eIEC61850-6-100:VariableApplyTo element="SUB/VA/BA/F1" elementUuid="function-1-uuid" ${id}="apply-to-a"/>
									</eIEC61850-6-100:Variable>
									<eIEC61850-6-100:Application name="A1" type="DCS" uuid="application-1-uuid" ${id}="application-s">
										<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
											<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
												<eIEC61850-6-100:FunctionRef function="SUB/VA/BA/F1" functionUuid="function-1-uuid" ${id}="function-ref-s"/>
												<eIEC61850-6-100:VariableRef variable="SUB/VA/BA/V1" variableUuid="variable-1-uuid" ${id}="variable-ref-z"/>
												<eIEC61850-6-100:VariableRef variable="SUB/VA/BA/V2" variableUuid="variable-2-uuid" ${id}="variable-ref-a"/>
											</eIEC61850-6-100:FunctionRoleContent>
										</eIEC61850-6-100:FunctionRole>
									</eIEC61850-6-100:Application>
								</Private>
								<Function name="F1" uuid="function-1-uuid" ${id}="function-s"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			targetXml,
			expectedQueries: [
				'//default:Bay[@name="BA"]/default:Private/v2019C1:Variable[1][@name="V1"]',
				'//default:Bay[@name="BA"]/default:Private/v2019C1:Variable[2][@name="V2"]',
			],
		},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<
		SclTest.BaseXmlTestCase & { targetXml: string }
	>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'ssd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: substationRef,
			anchor,
		}
		const reported = await report(target.query, lifecycleTarget)
		await target.transaction(async function applyPlacement(tx) {
			await apply(tx, { ...lifecycleTarget, report: reported })
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The case's document is the project holding the placed template; the newer template is opened beside it. */
type UpdateTestCase = SclTest.BaseXmlTestCase & { templateXml: string }

describe('apply of an update - siblings the template gains are written in the order of the template', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		'two categories gained by the subfunctions of a placed function, the second of the lower id → written first C1, then C2':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t">
							<SourceFiles ${id}="source-files-t">
								<SclFileReference fileName="template.ssd" fileType="SSD" fileUuid="ssd-document-uuid" revision="1" version="0" ${id}="file-reference-t"/>
							</SourceFiles>
						</Header>
						<Substation name="SUB" templateUuid="substation-uuid" ${id}="substation-t">
							<VoltageLevel name="VA" templateUuid="voltage-level-uuid" ${id}="voltage-level-t">
								<Bay name="BA" templateUuid="bay-uuid" ${id}="bay-t">
									<Function name="F1" templateUuid="function-1-uuid" ${id}="function-t">
										<SubFunction name="S1" templateUuid="subfunction-1-uuid" ${id}="subfunction-1-t"/>
										<SubFunction name="S2" templateUuid="subfunction-2-uuid" ${id}="subfunction-2-t"/>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="2" ${id}="header-s"/>
						<Substation name="SUB" uuid="substation-uuid" ${id}="substation-s">
							<VoltageLevel name="VA" uuid="voltage-level-uuid" ${id}="voltage-level-s">
								<Bay name="BA" uuid="bay-uuid" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:FunctionCategory name="C1" uuid="category-1-uuid" ${id}="category-z">
											<eIEC61850-6-100:FunctionCatRef function="SUB/VA/BA/F1/S1" functionUuid="subfunction-1-uuid" ${id}="category-ref-z"/>
										</eIEC61850-6-100:FunctionCategory>
										<eIEC61850-6-100:FunctionCategory name="C2" uuid="category-2-uuid" ${id}="category-a">
											<eIEC61850-6-100:FunctionCatRef function="SUB/VA/BA/F1/S2" functionUuid="subfunction-2-uuid" ${id}="category-ref-a"/>
										</eIEC61850-6-100:FunctionCategory>
									</Private>
									<Function name="F1" uuid="function-1-uuid" ${id}="function-s">
										<!-- the subfunctions too: their ids sort the other way round -->
										<SubFunction name="S1" uuid="subfunction-1-uuid" ${id}="subfunction-z"/>
										<SubFunction name="S2" uuid="subfunction-2-uuid" ${id}="subfunction-a"/>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:Bay[@name="BA"]/default:Private/v2019C1:FunctionCategory[1][@name="C1"]',
					'//default:Bay[@name="BA"]/default:Private/v2019C1:FunctionCategory[2][@name="C2"]',
				],
			},

		'two functions gained by a placed bay, the second of the lower id → written first F1, then F2':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t">
							<SourceFiles ${id}="source-files-t">
								<SclFileReference fileName="template.ssd" fileType="SSD" fileUuid="ssd-document-uuid" revision="1" version="0" ${id}="file-reference-t"/>
							</SourceFiles>
						</Header>
						<Substation name="SUB" templateUuid="substation-uuid" ${id}="substation-t">
							<VoltageLevel name="VA" templateUuid="voltage-level-uuid" ${id}="voltage-level-t">
								<Bay name="BA" templateUuid="bay-uuid" ${id}="bay-t">
									<Function name="F0" templateUuid="function-0-uuid" ${id}="function-0-t"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="2" ${id}="header-s"/>
						<Substation name="SUB" uuid="substation-uuid" ${id}="substation-s">
							<VoltageLevel name="VA" uuid="voltage-level-uuid" ${id}="voltage-level-s">
								<Bay name="BA" uuid="bay-uuid" ${id}="bay-s">
									<Function name="F0" uuid="function-0-uuid" ${id}="function-s"/>
									<Function name="F1" uuid="function-1-uuid" ${id}="function-z"/>
									<Function name="F2" uuid="function-2-uuid" ${id}="function-a"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:Bay[@name="BA"]/default:Function[2][@name="F1"]',
					'//default:Bay[@name="BA"]/default:Function[3][@name="F2"]',
				],
			},
	}

	async function act(params: SclTest.ActParams<UpdateTestCase>): Promise<SclTest.ActResult> {
		const { testCase, project, source } = params
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
		})
		const update = {
			verb: 'ssd' as const,
			scenario: 'template' as const,
			sourceQuery: template.query,
			ref: substationRef,
			anchor,
		}
		const reported = await report(source.query, update)
		await source.transaction(async function applyUpdate(tx) {
			await apply(tx, { ...update, report: reported, resolution: { decisions: new Map() } })
		})

		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
