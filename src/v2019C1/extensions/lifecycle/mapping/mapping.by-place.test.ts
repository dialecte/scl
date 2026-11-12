import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The case's document is the project; the template is opened beside it, and placed under `anchor`. */
type PlacementTestCase = SclTest.BaseXmlTestCase & {
	templateXml: string
	anchor: Scl.Ref<Scl.ElementsOf>
}

const substationTemplateRef = { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>

/** Report the template's placement on the project, apply it, and assert the exported project. */
async function placeAndExpect(
	params: SclTest.ActParams<PlacementTestCase>,
): Promise<SclTest.ActResult> {
	const { testCase, project, source } = params
	const template = await openSclDocument({ project, xml: testCase.templateXml, label: 'template' })
	const placement = {
		verb: 'ssd' as const,
		scenario: 'instantiate' as const,
		sourceQuery: template.query,
		ref: substationTemplateRef,
		anchor: testCase.anchor,
	}
	const reported = await report(source.query, placement)
	await source.transaction(async function write(tx) {
		await apply(tx, { ...placement, report: reported })
	})
	await expectExportedQueries({ act: params })
	return { assertOn: 'source' }
}

/**
 * A role is identified by where it sits: a role of the template is found by its name only in the element of the
 * project its own level lands on, never elsewhere in the document.
 */
describe('shared-element mapping — a role found by its name where its level lands', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		"the role's bay created, a role of that name in another substation → a new role in the placed bay":
			{
				templateXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
					<Substation name="TEMPLATE" ${id}="substation-s">
						<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
							<Bay name="B1" ${id}="bay-s">
								<Private type="eIEC61850-6-100" ${id}="private-s">
									<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source-uuid" ${id}="role-s">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
									</eIEC61850-6-100:AllocationRole>
									<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-source-uuid" ${id}="application-s">
										<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
											<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
												<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
											</eIEC61850-6-100:FunctionRoleContent>
										</eIEC61850-6-100:FunctionRole>
										<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/B1/PIU" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
									</eIEC61850-6-100:Application>
								</Private>
								<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Header id="project" uuid="project-uuid" ${id}="header-t"/>
					<Substation name="S1" ${id}="substation-1-t">
						<!-- no bay B1: the template's bay is created here -->
						<VoltageLevel name="V1" ${id}="voltage-level-1-t"/>
					</Substation>
					<Substation name="S2" ${id}="substation-2-t">
						<VoltageLevel name="V2" ${id}="voltage-level-2-t">
							<Bay name="B9" ${id}="bay-elsewhere-t">
								<Private type="eIEC61850-6-100" ${id}="private-elsewhere-t">
									<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-elsewhere-uuid" ${id}="role-elsewhere-t"/>
								</Private>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-1-t' },
				expectedQueries: [
					'//default:Substation[@name="S1"]//default:Bay[@name="B1"]/default:Private/v2019C1:AllocationRole[@name="PIU"]',
					'//v2019C1:Application[@name="Control"]/v2019C1:AllocationRoleRef[@allocationRole="S1/V1/B1/PIU"]',
				],
				unexpectedQueries: [
					'//v2019C1:Application[@name="Control"]/v2019C1:AllocationRoleRef[@allocationRole="S2/V2/B9/PIU"]',
					// the role elsewhere is left as it is
					'//default:Bay[@name="B9"]//v2019C1:AllocationRole/v2019C1:FunctionRef',
				],
			},
		"the role's voltage level landing on one of the project holding a role of that name, another elsewhere → mapped onto the one of that voltage level":
			{
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Private type="eIEC61850-6-100" ${id}="voltage-level-private-s">
									<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source-uuid" ${id}="role-s">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
									</eIEC61850-6-100:AllocationRole>
								</Private>
								<Bay name="B1" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="bay-private-s">
										<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-source-uuid" ${id}="application-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
											<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<Substation name="S1" ${id}="substation-1-t">
							<VoltageLevel name="V1" ${id}="voltage-level-1-t">
								<Private type="eIEC61850-6-100" ${id}="private-here-t">
									<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-here-uuid" ${id}="role-here-t"/>
								</Private>
								<!-- no bay B1: the template's bay is created here -->
							</VoltageLevel>
						</Substation>
						<Substation name="S2" ${id}="substation-2-t">
							<VoltageLevel name="V2" ${id}="voltage-level-2-t">
								<Bay name="B9" ${id}="bay-elsewhere-t">
									<Private type="eIEC61850-6-100" ${id}="private-elsewhere-t">
										<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-elsewhere-uuid" ${id}="role-elsewhere-t"/>
									</Private>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-1-t' },
				expectedQueries: [
					'//v2019C1:Application[@name="Control"]/v2019C1:AllocationRoleRef[@allocationRole="S1/V1/PIU"][@allocationRoleUuid="role-here-uuid"]',
					// the role of that voltage level gains the placed function
					'//v2019C1:AllocationRole[@uuid="role-here-uuid"]/v2019C1:FunctionRef[@function="S1/V1/B1/Prot"]',
				],
				unexpectedQueries: [
					'//default:VoltageLevel[@name="V1"]/default:Private/v2019C1:AllocationRole[@name="PIU"][2]',
					'//default:Bay[@name="B9"]//v2019C1:AllocationRole/v2019C1:FunctionRef',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act: placeAndExpect })
})

/** A same-named role elsewhere in the project is no automatic match, but stays one the consumer may choose. */
describe('shared-element mapping — a same-named role elsewhere, as the report lists it', () => {
	type ReportTestCase = PlacementTestCase & {
		expected: { mapping: unknown; candidateIds: string[] }
	}

	const testCases: SclTest.TestCases<ReportTestCase> = {
		"the role's bay created, a role of that name in another substation → a new role, the other one a candidate":
			{
				templateXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
					<Substation name="TEMPLATE" ${id}="substation-s">
						<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
							<Bay name="B1" ${id}="bay-s">
								<Private type="eIEC61850-6-100" ${id}="private-s">
									<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source-uuid" ${id}="role-s">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
									</eIEC61850-6-100:AllocationRole>
									<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-source-uuid" ${id}="application-s">
										<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
											<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
												<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
											</eIEC61850-6-100:FunctionRoleContent>
										</eIEC61850-6-100:FunctionRole>
										<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/B1/PIU" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
									</eIEC61850-6-100:Application>
								</Private>
								<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Header id="project" uuid="project-uuid" ${id}="header-t"/>
					<Substation name="S1" ${id}="substation-1-t">
						<!-- no bay B1: the template's bay is created here -->
						<VoltageLevel name="V1" ${id}="voltage-level-1-t"/>
					</Substation>
					<Substation name="S2" ${id}="substation-2-t">
						<VoltageLevel name="V2" ${id}="voltage-level-2-t">
							<Bay name="B9" ${id}="bay-elsewhere-t">
								<Private type="eIEC61850-6-100" ${id}="private-elsewhere-t">
									<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-elsewhere-uuid" ${id}="role-elsewhere-t"/>
								</Private>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-1-t' },
				expected: { mapping: { create: { name: 'PIU' } }, candidateIds: ['role-elsewhere-t'] },
			},
	}

	async function act({
		testCase,
		project,
		source,
	}: SclTest.ActParams<ReportTestCase>): Promise<void> {
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
		})
		const reported = await report(source.query, {
			verb: 'ssd',
			scenario: 'instantiate',
			sourceQuery: template.query,
			ref: substationTemplateRef,
			anchor: testCase.anchor,
		})
		const roleMapping = reported.mappings.find(function isRole(mapping) {
			return mapping.id === 'role-s'
		})
		expect({
			mapping: roleMapping?.mapping,
			candidateIds: roleMapping?.candidates.map(function idOf(candidate) {
				return candidate.ref.id
			}),
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/**
 * Apply writes the categories where the report says, resolved before anything is written: what it created for one bay
 * is not what another bay's category of the same name maps onto.
 */
describe('shared-element mapping — bays each holding a category of the same name', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		'two bays each holding a category "MEASUREMENT" of their application\'s function, none in the project → one per bay':
			{
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="V1" ${id}="voltage-level-s">
								<Bay name="B1" ${id}="bay-1-s">
									<Private type="eIEC61850-6-100" ${id}="private-1-s">
										<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-1-source-uuid" ${id}="category-1-s">
											<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/V1/B1/Prot" functionUuid="function-1-source-uuid" ${id}="category-ref-1-s"/>
										</eIEC61850-6-100:FunctionCategory>
										<eIEC61850-6-100:Application name="Control_1" type="DCS" uuid="application-1-source-uuid" ${id}="application-1-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-1-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-1-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/V1/B1/Prot" functionUuid="function-1-source-uuid" ${id}="application-function-ref-1-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="function-1-source-uuid" ${id}="function-1-s"/>
								</Bay>
								<Bay name="B2" ${id}="bay-2-s">
									<Private type="eIEC61850-6-100" ${id}="private-2-s">
										<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-2-source-uuid" ${id}="category-2-s">
											<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/V1/B2/Prot" functionUuid="function-2-source-uuid" ${id}="category-ref-2-s"/>
										</eIEC61850-6-100:FunctionCategory>
										<eIEC61850-6-100:Application name="Control_2" type="DCS" uuid="application-2-source-uuid" ${id}="application-2-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-2-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-2-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/V1/B2/Prot" functionUuid="function-2-source-uuid" ${id}="application-function-ref-2-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="function-2-source-uuid" ${id}="function-2-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<!-- no FunctionCategory anywhere: both categories are new -->
						<Substation name="S1" ${id}="substation-t"/>
					</SCL>
				`,
				anchor: { tagName: 'Substation', id: 'substation-t' },
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Private/v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]',
					'//default:Bay[@name="B2"]/default:Private/v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@function="S1/V1/B2/Prot"]',
				],
				unexpectedQueries: [
					'//default:Bay[@name="B1"]//v2019C1:FunctionCatRef[@function="S1/V1/B2/Prot"]',
					'//default:Bay[@name="B2"]//v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]',
				],
			},
		'two bays each holding a category "MEASUREMENT" of a function of their own, no application, none in the project → one per bay':
			{
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="V1" ${id}="voltage-level-s">
								<Bay name="B1" ${id}="bay-1-s">
									<Private type="eIEC61850-6-100" ${id}="private-1-s">
										<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-1-source-uuid" ${id}="category-1-s">
											<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/V1/B1/Prot" functionUuid="function-1-source-uuid" ${id}="category-ref-1-s"/>
										</eIEC61850-6-100:FunctionCategory>
									</Private>
									<Function name="Prot" uuid="function-1-source-uuid" ${id}="function-1-s"/>
								</Bay>
								<Bay name="B2" ${id}="bay-2-s">
									<Private type="eIEC61850-6-100" ${id}="private-2-s">
										<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-2-source-uuid" ${id}="category-2-s">
											<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/V1/B2/Prot" functionUuid="function-2-source-uuid" ${id}="category-ref-2-s"/>
										</eIEC61850-6-100:FunctionCategory>
									</Private>
									<Function name="Prot" uuid="function-2-source-uuid" ${id}="function-2-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<!-- no FunctionCategory anywhere: both categories are new -->
						<Substation name="S1" ${id}="substation-t"/>
					</SCL>
				`,
				anchor: { tagName: 'Substation', id: 'substation-t' },
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Private/v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]',
					'//default:Bay[@name="B2"]/default:Private/v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@function="S1/V1/B2/Prot"]',
				],
				unexpectedQueries: [
					'//default:Bay[@name="B1"]//v2019C1:FunctionCatRef[@function="S1/V1/B2/Prot"]',
					'//default:Bay[@name="B2"]//v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act: placeAndExpect })
})

/** A category is identified by where it sits, as a role is: one of the same name elsewhere is no automatic match. */
describe('shared-element mapping — a category found by its name where its level lands', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		"the category's bay created, a category of that name in another substation → a new category in the placed bay":
			{
				templateXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
					<Substation name="TEMPLATE" ${id}="substation-s">
						<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
							<Bay name="B1" ${id}="bay-s">
								<Private type="eIEC61850-6-100" ${id}="private-s">
									<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s">
										<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="category-ref-s"/>
									</eIEC61850-6-100:FunctionCategory>
								</Private>
								<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Header id="project" uuid="project-uuid" ${id}="header-t"/>
					<Substation name="S1" ${id}="substation-1-t">
						<!-- no bay B1: the template's bay is created here -->
						<VoltageLevel name="V1" ${id}="voltage-level-1-t"/>
					</Substation>
					<Substation name="S2" ${id}="substation-2-t">
						<VoltageLevel name="V2" ${id}="voltage-level-2-t">
							<Bay name="B9" ${id}="bay-elsewhere-t">
								<Private type="eIEC61850-6-100" ${id}="private-elsewhere-t">
									<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-elsewhere-uuid" ${id}="category-elsewhere-t">
										<eIEC61850-6-100:FunctionCatRef function="S2/V2/B9/Meas" functionUuid="function-elsewhere-uuid" ${id}="category-ref-elsewhere-t"/>
									</eIEC61850-6-100:FunctionCategory>
								</Private>
								<Function name="Meas" uuid="function-elsewhere-uuid" ${id}="function-elsewhere-t"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-1-t' },
				expectedQueries: [
					'//default:Substation[@name="S1"]//default:Bay[@name="B1"]/default:Private/v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]',
				],
				unexpectedQueries: [
					'//default:Bay[@name="B9"]//v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act: placeAndExpect })
})
