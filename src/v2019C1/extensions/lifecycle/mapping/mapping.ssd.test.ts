import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DecisionMapping } from './mapping.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const substationRef = { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

// A bay typical whose application allocates its function to the role "HMI_PC"; both sit in the bay.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="B1" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="private-s">
						<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
						</eIEC61850-6-100:AllocationRole>
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/B1/HMI_PC" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-project-uuid" ${id}="role-t"/>
				<eIEC61850-6-100:AllocationRole name="Gateway" uuid="gateway-project-uuid" ${id}="gateway-t"/>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	chosen?: [string, DecisionMapping][]
	expected: {
		/** Where the report says the source role lands. */
		mapping: DecisionMapping
		/** The path the instantiated Application's role reference carries. */
		rolePath: string
		/** Names of every AllocationRole of the project, once applied. */
		roleNames: string[]
	}
}

describe('shared-element mapping — an SSD carrying an application', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'one role of that name in the project → listed and mapped onto it': {
			sourceXml,
			targetXml: projectXml,
			expected: {
				mapping: { existing: { tagName: 'AllocationRole', id: 'role-t' } },
				rolePath: 'S1/HMI_PC',
				roleNames: ['Gateway', 'HMI_PC'],
			},
		},
		'the consumer picks another role of the project → listed and mapped onto that one': {
			sourceXml,
			targetXml: projectXml,
			chosen: [['role-s', { existing: { tagName: 'AllocationRole', id: 'gateway-t' } }]],
			expected: {
				mapping: { existing: { tagName: 'AllocationRole', id: 'gateway-t' } },
				rolePath: 'S1/Gateway',
				roleNames: ['Gateway', 'HMI_PC'],
			},
		},
		'the consumer wants a new role → created in the placed bay, where its name is free': {
			sourceXml,
			targetXml: projectXml,
			chosen: [['role-s', { create: {} }]],
			expected: {
				mapping: { create: { name: 'HMI_PC' } },
				// the typical's bay is placed as B1_1 beside the project's B1
				rolePath: 'S1/V1/B1_1/HMI_PC',
				roleNames: ['Gateway', 'HMI_PC', 'HMI_PC'],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'ssd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: substationRef,
			anchor: bayRef,
		}
		const decisionMappings = new Map(testCase.chosen ?? [])

		const reported = await report(target.query, {
			...lifecycleTarget,
			resolution: { mappings: decisionMappings },
		})
		const roleMapping = reported.mappings.find((mapping) => mapping.id === 'role-s')
		expect(roleMapping?.mapping, 'report').toEqual(testCase.expected.mapping)

		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: reported,
				resolution: { decisions: new Map(), mappings: decisionMappings },
			})
		})

		const [applicationInstance] = await target.query.findByAttributes({
			tagName: 'Application',
			attributes: { templateUuid: 'application-source-uuid' },
		})
		const { AllocationRoleRef: roleReferences = [] } = await target.query.findDescendants(
			{ tagName: 'Application', id: applicationInstance.id },
			{ collect: 'AllocationRoleRef' },
		)
		const rolePath = await target.query.getAttribute(roleReferences[0], { name: 'allocationRole' })
		expect(rolePath, 'apply').toBe(testCase.expected.rolePath)

		const projectRoles = await target.query.getRecordsByTagName('AllocationRole')
		const roleNames: string[] = []
		for (const role of projectRoles) {
			const name = await target.query.getAttribute(role, { name: 'name' })
			roleNames.push(name ?? '')
		}
		expect(roleNames.sort(), 'apply').toEqual(testCase.expected.roleNames)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
