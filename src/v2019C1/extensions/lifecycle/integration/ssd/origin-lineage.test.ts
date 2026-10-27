import { findByName, reportAndApply } from '../integration-helpers'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { readRevisionTwin } from '@/v2019C1/test/revision-twins'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	scenario: Extract<LifecycleScenario, 'instantiate' | 'fork'>
	/** The level of the file the case names, by its name. Default: its substation. */
	unit?: { tagName: 'VoltageLevel' | 'Bay'; name: string }
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`

/** A bay template whose bay and application carry the lineage the case gives (made from other files). */
function feederWith(params: { bayLineage?: string; applicationLineage?: string }): string {
	const { bayLineage = '', applicationLineage = '' } = params
	return /* xml */ `
		<SCL ${ns} ${id}="source">
			<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="source-header"/>
			<Substation name="TEMPLATE" ${id}="source-substation">
				<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
					<Bay name="Feeder" uuid="feeder-uuid" ${bayLineage} ${id}="source-feeder">
						<Private type="eIEC61850-6-100" ${id}="source-feeder-private">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${applicationLineage} ${id}="source-application">
								<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="source-function-role">
									<eIEC61850-6-100:FunctionRoleContent ${id}="source-function-role-content">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Prot" functionUuid="function-uuid" ${id}="source-function-ref"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="Prot" uuid="function-uuid" ${id}="source-function"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

/** The applications of the high-voltage level of the bay template twin, each made from its application file. */
const BREAKER_APPLICATION = '00000000-0000-4000-8000-000000000412'
const BREAKER_APPLICATION_TEMPLATE = '00000000-0000-4000-8000-000000000110'
const OVERCURRENT_APPLICATION = '00000000-0000-4000-8000-000000000470'
const OVERCURRENT_APPLICATION_TEMPLATE = '00000000-0000-4000-8000-000000000210'

describe('ssd origin lineage: what a placement writes of the lineage the template carries', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"an instance takes the template's lineage of an application as its origin": {
			sourceXml: feederWith({ applicationLineage: 'templateUuid="asd-application"' }),
			targetXml: projectXml,
			scenario: 'instantiate',
			expectedQueries: [
				'//v2019C1:Application[@templateUuid="application-uuid"][@originUuid="asd-application"]',
			],
		},
		'an instance conserves the origin an application of the template carries': {
			sourceXml: feederWith({
				applicationLineage: 'templateUuid="asd-application" originUuid="fsd-origin"',
			}),
			targetXml: projectXml,
			scenario: 'instantiate',
			expectedQueries: [
				'//v2019C1:Application[@templateUuid="application-uuid"][@originUuid="fsd-origin"]',
			],
		},
		'a first fork keeps the lineage of the level it creates and of the application it places': {
			sourceXml: feederWith({
				bayLineage: 'templateUuid="bay-template"',
				applicationLineage: 'templateUuid="asd-application" originUuid="fsd-origin"',
			}),
			targetXml: projectXml,
			scenario: 'fork',
			expectedQueries: [
				'//default:Bay[@uuid="feeder-uuid"][@templateUuid="bay-template"]',
				'//v2019C1:Application[@uuid="application-uuid"][@templateUuid="asd-application"][@originUuid="fsd-origin"]',
			],
		},
		'an instance of the bay template made from application files records each application file as its origin':
			{
				sourceXml: readRevisionTwin({ twin: 'twoLevelBayTemplate', revision: 1 }),
				targetXml: projectXml,
				scenario: 'instantiate',
				unit: { tagName: 'VoltageLevel', name: 'TEMPLATE_HV' },
				expectedQueries: [
					`//v2019C1:Application[@templateUuid="${BREAKER_APPLICATION}"][@originUuid="${BREAKER_APPLICATION_TEMPLATE}"]`,
					`//v2019C1:Application[@templateUuid="${OVERCURRENT_APPLICATION}"][@originUuid="${OVERCURRENT_APPLICATION_TEMPLATE}"]`,
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const [substation] = await source.query.getRecordsByTagName('Substation')
		const ref = testCase.unit
			? await findByName(source.query, testCase.unit)
			: { tagName: 'Substation' as const, id: substation.id }
		await reportAndApply({
			document: target,
			lifecycle: {
				verb: 'ssd',
				sourceQuery: source.query,
				ref,
				anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' } as Scl.Ref<'VoltageLevel'>,
				scenario: testCase.scenario,
			},
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
