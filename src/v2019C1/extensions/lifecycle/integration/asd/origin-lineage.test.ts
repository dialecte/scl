import { findByUuid, reportAndApply } from '../integration-helpers'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	scenario: Extract<LifecycleScenario, 'instantiate' | 'fork'>
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** An ASD whose application and allocation role carry the lineage the case gives (an instance of other files). */
function asdWith(params: { applicationLineage?: string; roleLineage?: string }): string {
	const { applicationLineage = '', roleLineage = '' } = params
	return /* xml */ `
		<SCL ${ns} ${id}="source">
			<Header id="application-file" uuid="application-file-uuid" version="1" revision="1" ${id}="source-header"/>
			<Substation name="TEMPLATE" ${id}="source-substation">
				<Private type="eIEC61850-6-100" ${id}="source-substation-private">
					<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-uuid" ${roleLineage} ${id}="source-role">
						<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="source-role-function-ref"/>
					</eIEC61850-6-100:AllocationRole>
					<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${applicationLineage} ${id}="source-application">
						<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="source-function-role">
							<eIEC61850-6-100:FunctionRoleContent ${id}="source-function-role-content">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="source-function-ref"/>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="role-uuid" ${id}="source-role-ref"/>
					</eIEC61850-6-100:Application>
				</Private>
				<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
					<Bay name="TEMPLATE" ${id}="source-bay">
						<Function name="Prot" uuid="function-uuid" ${id}="source-function"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

describe('asd origin lineage: what a placement writes of the lineage the template carries', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"an instance conserves the origin the template's application and role carry": {
			sourceXml: asdWith({
				applicationLineage: 'templateUuid="origin-application" originUuid="first-application"',
				roleLineage: 'templateUuid="origin-role" originUuid="first-role"',
			}),
			targetXml: projectXml,
			scenario: 'instantiate',
			expectedQueries: [
				'//v2019C1:Application[@templateUuid="application-uuid"][@originUuid="first-application"]',
				'//v2019C1:AllocationRole[@templateUuid="role-uuid"][@originUuid="first-role"]',
			],
		},
		"an instance takes the template's own lineage as its origin": {
			sourceXml: asdWith({
				applicationLineage: 'templateUuid="origin-application"',
				roleLineage: 'templateUuid="origin-role"',
			}),
			targetXml: projectXml,
			scenario: 'instantiate',
			expectedQueries: [
				'//v2019C1:Application[@templateUuid="application-uuid"][@originUuid="origin-application"]',
				'//v2019C1:AllocationRole[@templateUuid="role-uuid"][@originUuid="origin-role"]',
			],
		},
		'an instance of a template without lineage has no origin': {
			sourceXml: asdWith({}),
			targetXml: projectXml,
			scenario: 'instantiate',
			expectedQueries: [
				'//v2019C1:Application[@templateUuid="application-uuid"]',
				'//v2019C1:AllocationRole[@templateUuid="role-uuid"]',
			],
			unexpectedQueries: [
				'//v2019C1:Application[@originUuid]',
				'//v2019C1:AllocationRole[@originUuid]',
			],
		},
		"a first fork keeps the uuids and the lineage the file's application and role carry": {
			sourceXml: asdWith({
				applicationLineage: 'templateUuid="origin-application" originUuid="first-application"',
				roleLineage: 'templateUuid="origin-role" originUuid="first-role"',
			}),
			targetXml: projectXml,
			scenario: 'fork',
			expectedQueries: [
				'//v2019C1:Application[@uuid="application-uuid"][@templateUuid="origin-application"][@originUuid="first-application"]',
				'//v2019C1:AllocationRole[@uuid="role-uuid"][@templateUuid="origin-role"][@originUuid="first-role"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await reportAndApply({
			document: target,
			lifecycle: {
				verb: 'asd',
				sourceQuery: source.query,
				ref: await findByUuid(source.query, { tagName: 'Application', uuid: 'application-uuid' }),
				anchor: { tagName: 'Bay', id: 'project-bay' } as Scl.Ref<'Bay'>,
				scenario: testCase.scenario,
			},
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
