import { reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

describe('lifecycle - a linked allocation role read from the project keeps its allocations', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two applications sharing a project role → each allocation retained once without overwriting the role':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<Substation name="TEMPLATE">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:Application name="PROT_APP" type="Protection" uuid="protection-application" ${id}="protection-application">
									<eIEC61850-6-100:FunctionRole name="ROOT">
										<eIEC61850-6-100:FunctionRoleContent>
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
									<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source"/>
								</eIEC61850-6-100:Application>
								<eIEC61850-6-100:Application name="CTRL_APP" type="Control" uuid="control-application" ${id}="control-application">
									<eIEC61850-6-100:FunctionRole name="ROOT">
										<eIEC61850-6-100:FunctionRoleContent>
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
									<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source"/>
								</eIEC61850-6-100:Application>
							</Private>
							<VoltageLevel name="TEMPLATE">
								<Bay name="TEMPLATE">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source">
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source"/>
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source"/>
										</eIEC61850-6-100:AllocationRole>
									</Private>
									<Function name="Prot" uuid="function-source"/>
									<Function name="Ctrl" uuid="control-source"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Header id="project" uuid="project-file"/>
						<Substation name="S1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project category" uuid="category-project">
									<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function"/>
								</eIEC61850-6-100:FunctionCategory>
							</Private>
							<VoltageLevel name="V1">
								<Bay name="B1" ${id}="first-bay">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:AllocationRole name="PIU" desc="project role" uuid="role-project"/>
									</Private>
									<Function name="Local" uuid="local-function"/>
								</Bay>
								<Bay name="B2"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					// the project role stays the only one, untouched
					'/default:SCL[count(.//v2019C1:AllocationRole)=1]',
					`//v2019C1:AllocationRole[@uuid="role-project"][@desc="project role"]`,
					// it allocates each placed function once
					`//v2019C1:AllocationRole[@uuid="role-project"][count(.//v2019C1:FunctionRef)=2]`,
					`//v2019C1:AllocationRole[@uuid="role-project"]//v2019C1:FunctionRef[@function="S1/V1/B1/Prot"]`,
					`//v2019C1:AllocationRole[@uuid="role-project"]//v2019C1:FunctionRef[@function="S1/V1/B1/Ctrl"]`,
					'/default:SCL[count(.//default:Function[@templateUuid="function-source"])=1]',
					'/default:SCL[count(.//default:Function[@templateUuid="control-source"])=1]',
					`//v2019C1:AllocationRole[@uuid="role-project"]//v2019C1:FunctionRef[@functionUuid = //default:Function[@templateUuid="function-source"]/@uuid]`,
					`//v2019C1:AllocationRole[@uuid="role-project"]//v2019C1:FunctionRef[@functionUuid = //default:Function[@templateUuid="control-source"]/@uuid]`,
					// both applications point at the project role
					'/default:SCL[count(.//v2019C1:AllocationRoleRef)=2]',
					'//v2019C1:AllocationRoleRef[@allocationRoleUuid="role-project"]',
				],
				unexpectedQueries: ['//v2019C1:AllocationRoleRef[not(@allocationRoleUuid="role-project")]'],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		for (const applicationId of ['protection-application', 'control-application']) {
			await reportAndApply({
				document: target,
				lifecycle: {
					verb: 'asd',
					scenario: 'instantiate',
					sourceQuery: source.query,
					ref: { tagName: 'Application', id: applicationId },
					anchor: { tagName: 'Bay', id: 'first-bay' } as Scl.Ref<'Bay'>,
				},
			})
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('lifecycle - placing applications from a template file only reads it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two applications placed from the template → the template file as it was': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="template">
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:Application name="PROT_APP" type="Protection" uuid="protection-application" ${id}="protection-application">
								<eIEC61850-6-100:FunctionRole name="ROOT">
									<eIEC61850-6-100:FunctionRoleContent>
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
								<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source"/>
							</eIEC61850-6-100:Application>
							<eIEC61850-6-100:Application name="CTRL_APP" type="Control" uuid="control-application" ${id}="control-application">
								<eIEC61850-6-100:FunctionRole name="ROOT">
									<eIEC61850-6-100:FunctionRoleContent>
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
								<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source"/>
							</eIEC61850-6-100:Application>
						</Private>
						<VoltageLevel name="TEMPLATE">
							<Bay name="TEMPLATE">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source"/>
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source"/>
									</eIEC61850-6-100:AllocationRole>
								</Private>
								<Function name="Prot" uuid="function-source"/>
								<Function name="Ctrl" uuid="control-source"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="project">
					<Header id="project" uuid="project-file"/>
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project category" uuid="category-project">
								<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function"/>
							</eIEC61850-6-100:FunctionCategory>
						</Private>
						<VoltageLevel name="V1">
							<Bay name="B1" ${id}="first-bay">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:AllocationRole name="PIU" desc="project role" uuid="role-project"/>
								</Private>
								<Function name="Local" uuid="local-function"/>
							</Bay>
							<Bay name="B2"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const templateBefore = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
		for (const applicationId of ['protection-application', 'control-application']) {
			await reportAndApply({
				document: target,
				lifecycle: {
					verb: 'asd',
					scenario: 'instantiate',
					sourceQuery: source.query,
					ref: { tagName: 'Application', id: applicationId },
					anchor: { tagName: 'Bay', id: 'first-bay' } as Scl.Ref<'Bay'>,
				},
			})
		}
		const templateAfter = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
		expect(templateAfter).toEqual(templateBefore)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
