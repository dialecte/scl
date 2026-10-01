import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

// An Application that allocates its function to the role "HMI_PC".
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expected: {
		/** Record id of the project role both the report and the apply map the source role onto. */
		mappedOnto: string | undefined
		/** Names of every AllocationRole of the project once applied. */
		roleNames: string[]
		/** Attributes of the role the report announces as changing (none when left out). */
		reportedRoleChanges?: string[]
		/** The description of the role the Application references, once applied. */
		appliedRoleDescription?: string
	}
}

describe('shared-element mapping — the report says what apply does', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'one role of that name in the project → report and apply both map onto it': {
			sourceXml,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Substation name="S1" ${id}="substation-t">
						<Private type="eIEC61850-6-100" ${id}="private-t">
							<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-project-uuid" ${id}="role-t"/>
						</Private>
						<VoltageLevel name="V1" ${id}="voltage-level-t">
							<Bay name="B1" ${id}="bay-t"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { mappedOnto: 'role-t', roleNames: ['HMI_PC'] },
		},
		'no role of that name in the project → report and apply both create it': {
			sourceXml,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Substation name="S1" ${id}="substation-t">
						<Private type="eIEC61850-6-100" ${id}="private-t">
							<eIEC61850-6-100:AllocationRole name="Gateway" uuid="role-project-uuid" ${id}="role-t"/>
							<!-- no AllocationRole named HMI_PC -->
						</Private>
						<VoltageLevel name="V1" ${id}="voltage-level-t">
							<Bay name="B1" ${id}="bay-t"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { mappedOnto: undefined, roleNames: ['Gateway', 'HMI_PC'] },
		},
		'two roles of that name in the project → neither is picked, both sides create it under a free name':
			{
				sourceXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Substation name="S1" ${id}="substation-t">
						<Private type="eIEC61850-6-100" ${id}="private-t">
							<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-project-uuid" ${id}="role-t"/>
						</Private>
						<VoltageLevel name="V1" ${id}="voltage-level-t">
							<Private type="eIEC61850-6-100" ${id}="voltage-level-private-t">
								<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-project-uuid-2" ${id}="role-t-2"/>
							</Private>
							<Bay name="B1" ${id}="bay-t"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				expected: { mappedOnto: undefined, roleNames: ['HMI_PC', 'HMI_PC', 'HMI_PC_1'] },
			},
		'the project role has its own description → mapped onto it, description kept and not announced as a change':
			{
				sourceXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Substation name="S1" ${id}="substation-t">
						<Private type="eIEC61850-6-100" ${id}="private-t">
							<eIEC61850-6-100:AllocationRole name="HMI_PC" desc="Operator workstation" uuid="role-project-uuid" ${id}="role-t"/>
						</Private>
						<VoltageLevel name="V1" ${id}="voltage-level-t">
							<Bay name="B1" ${id}="bay-t"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				expected: {
					mappedOnto: 'role-t',
					roleNames: ['HMI_PC'],
					reportedRoleChanges: [],
					appliedRoleDescription: 'Operator workstation',
				},
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const projectRolesBefore = await target.query.getRecordsByTagName('AllocationRole')
		const projectRoleIds = new Set(projectRolesBefore.map((role) => role.id))

		const lifecycleTarget = {
			verb: 'asd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		}

		// what the report says: the source role is a companion matched onto a project role, or not
		const reported = await report(target.query, lifecycleTarget)
		const roleCompanion = allGroups(reported)
			.flatMap((group) => group.companions)
			.find((companion) => companion.tagName === 'AllocationRole')
		const reportedOnto = roleCompanion?.instanceRef?.id

		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: reported,
				resolution: { decisions: new Map() },
			})
		})

		// what apply did: the role the instantiated Application now references
		const [applicationInstance] = await target.query.findByAttributes({
			tagName: 'Application',
			attributes: { templateUuid: 'application-source-uuid' },
		})
		const { AllocationRoleRef: roleReferences = [] } = await target.query.findDescendants(
			{ tagName: 'Application', id: applicationInstance.id },
			{ collect: 'AllocationRoleRef' },
		)
		const referencedRoleUuid = await target.query.getAttribute(roleReferences[0], {
			name: 'allocationRoleUuid',
		})
		const [referencedRole] = await target.query.findByAttributes({
			tagName: 'AllocationRole',
			attributes: { uuid: referencedRoleUuid },
		})
		const appliedOnto = projectRoleIds.has(referencedRole.id) ? referencedRole.id : undefined

		const projectRolesAfter = await target.query.getRecordsByTagName('AllocationRole')
		const roleNames: string[] = []
		for (const role of projectRolesAfter) {
			const name = await target.query.getAttribute(role, { name: 'name' })
			roleNames.push(name ?? '')
		}

		const reportedRoleChanges = (roleCompanion?.attributeChanges ?? []).map((change) => change.name)
		const appliedRoleDescription = await target.query.getAttribute(referencedRole, { name: 'desc' })

		expect(reportedOnto, 'report').toBe(testCase.expected.mappedOnto)
		expect(reportedRoleChanges, 'report').toEqual(testCase.expected.reportedRoleChanges ?? [])
		expect(appliedRoleDescription || undefined, 'apply').toBe(
			testCase.expected.appliedRoleDescription,
		)
		expect(appliedOnto, 'apply').toBe(testCase.expected.mappedOnto)
		expect(roleNames.sort()).toEqual(testCase.expected.roleNames)

		// whatever the role landed on, every reference of the project points at a project element
		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})
