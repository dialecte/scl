import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The case's document is the project; the template is opened beside it. */
type PlacementTestCase = SclTest.BaseXmlTestCase & { templateXml: string }

/**
 * A template element may be instantiated several times: its uuid, carried as the lineage of each instance, tells no
 * instance from another. A role found by its lineage counts only where its own level lands, as one found by its name.
 */
describe('shared-element mapping — a role found by its lineage where its level lands', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		'a bay typical placed a second time, the first bay holding the role made from it → the second bay gets its own role':
			{
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="Feeder" uuid="feeder-source-uuid" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source-uuid" ${id}="role-s">
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
										</eIEC61850-6-100:AllocationRole>
										<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-source-uuid" ${id}="application-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
											<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/Feeder/PIU" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
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
						<Substation name="S1" ${id}="substation-t">
							<VoltageLevel name="V1" ${id}="voltage-level-t">
								<!-- the typical placed once already -->
								<Bay name="Feeder" uuid="feeder-1-uuid" templateUuid="feeder-source-uuid" ${id}="bay-first-t">
									<Private type="eIEC61850-6-100" ${id}="private-first-t">
										<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-first-uuid" templateUuid="role-source-uuid" ${id}="role-first-t">
											<eIEC61850-6-100:FunctionRef function="S1/V1/Feeder/Prot" functionUuid="function-first-uuid" ${id}="role-function-ref-first-t"/>
										</eIEC61850-6-100:AllocationRole>
										<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-first-uuid" templateUuid="application-source-uuid" ${id}="application-first-t">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-first-t">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-first-t">
													<eIEC61850-6-100:FunctionRef function="S1/V1/Feeder/Prot" functionUuid="function-first-uuid" ${id}="application-function-ref-first-t"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
											<eIEC61850-6-100:AllocationRoleRef allocationRole="S1/V1/Feeder/PIU" allocationRoleUuid="role-first-uuid" ${id}="role-ref-first-t"/>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="function-first-uuid" templateUuid="function-source-uuid" ${id}="function-first-t"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:Bay[@name="Feeder_1"]/default:Private/v2019C1:AllocationRole[@name="PIU"][@templateUuid="role-source-uuid"]',
					'//default:Bay[@name="Feeder_1"]//v2019C1:AllocationRoleRef[@allocationRole="S1/V1/Feeder_1/PIU"]',
				],
				unexpectedQueries: [
					'//default:Bay[@name="Feeder_1"]//v2019C1:AllocationRoleRef[@allocationRole="S1/V1/Feeder/PIU"]',
					// the first bay's role allocates only the first bay's function
					'//v2019C1:AllocationRole[@uuid="role-first-uuid"]/v2019C1:FunctionRef[@function="S1/V1/Feeder_1/Prot"]',
				],
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
			ref: { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>,
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

/**
 * Placed under a level its template has no level of the tag for, a role is written in the nearest level above that the
 * project has: that is where a role of its name is found.
 */
describe('shared-element mapping — a role landing on the level above its own', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		"an application placed under a voltage level holding a role of the name of its bay's role → mapped onto that role":
			{
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="asd">
						<Header id="asd-header" uuid="asd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:AllocationRole name="BAY_CTRL" uuid="role-source-uuid" ${id}="role-s">
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
										</eIEC61850-6-100:AllocationRole>
										<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-source-uuid" ${id}="application-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
											<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/BAY_CTRL" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Ctrl" uuid="function-source-uuid" ${id}="function-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<Substation name="S1" ${id}="substation-t">
							<VoltageLevel name="V1" ${id}="voltage-level-t">
								<Private type="eIEC61850-6-100" ${id}="private-t">
									<eIEC61850-6-100:AllocationRole name="BAY_CTRL" uuid="role-here-uuid" ${id}="role-here-t"/>
								</Private>
								<!-- no bay: what the template's bay holds is written in the voltage level -->
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:Application[@name="Control"]/v2019C1:AllocationRoleRef[@allocationRoleUuid="role-here-uuid"]',
				],
				unexpectedQueries: [
					'//default:VoltageLevel[@name="V1"]/default:Private/v2019C1:AllocationRole[2]',
				],
			},
	}

	async function act(params: SclTest.ActParams<PlacementTestCase>): Promise<SclTest.ActResult> {
		const { testCase, project, source } = params
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
		})
		await source.transaction(async function write(tx) {
			await instantiateAsd(tx, {
				sourceQuery: template.query,
				applicationRef: { tagName: 'Application', id: 'application-s' },
				targetParent: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
			})
		})
		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
