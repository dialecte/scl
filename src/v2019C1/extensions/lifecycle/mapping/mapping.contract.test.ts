import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { DecisionMapping, ReportMapping } from './mapping.types'
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

// A project holding the role "HMI_PC" and another role, "Gateway".
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
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
	/** The consumer's choices, by source record id. */
	chosen?: [string, DecisionMapping][]
	/** A fragment of the refusal when the report rejects the choices; nothing else is then checked. */
	expectedRejection?: string
	expectedMappings: ReportMapping[]
	/**
	 * Only the names the report gives the roles to create, in report order, and the names apply
	 * gives them - the rest of the mappings is not checked.
	 */
	expectedNames?: string[]
	/** With `expectedNames`: what the report says of each name the engine had to change. */
	expectedCollisions?: ReportMapping['collision'][]
	/** A fragment of the refusal when apply is run on the report as it is. */
	expectedApplyRefusal?: string
	expectedNeedsDecisions?: boolean
	/** Once applied — left out when the case only concerns the report. */
	expectedApplied?: {
		/** Record id of the project role the report folds the source role onto, if any. */
		reportedOnto: string | undefined
		/** The path the Application's reference to its role carries. */
		rolePath: string
		/** The uuid that reference carries — left out for a role created on apply. */
		roleUuid?: string
		/** Names of every AllocationRole of the project. */
		roleNames: string[]
	}
}

const projectCandidates = [
	{ ref: { tagName: 'AllocationRole', id: 'gateway-t' }, title: 'Gateway', path: 'S1/Gateway' },
	{ ref: { tagName: 'AllocationRole', id: 'role-t' }, title: 'HMI_PC', path: 'S1/HMI_PC' },
] as ReportMapping['candidates']

describe('shared-element mapping — the report lists where each shared element lands', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'one role of that name in the project → listed as mapped onto it, with every project role as a candidate':
			{
				sourceXml,
				targetXml: projectXml,
				expectedMappings: [
					{
						id: 'role-s',
						tagName: 'AllocationRole',
						kind: 'shared',
						mapping: { existing: { tagName: 'AllocationRole', id: 'role-t' } },
						// the role is the project's own: it is reused, not an instance of the template's
						projectOwned: true,
						reason: 'name',
						ambiguous: false,
						selectable: true,
						locked: false,
						// both roles sit at the same level: listed by path
						candidates: projectCandidates,
					},
				],
			},
		'the consumer picks another role of the project → report and apply both map onto that one': {
			sourceXml,
			targetXml: projectXml,
			chosen: [['role-s', { existing: { tagName: 'AllocationRole', id: 'gateway-t' } }]],
			expectedMappings: [
				{
					id: 'role-s',
					tagName: 'AllocationRole',
					kind: 'shared',
					mapping: { existing: { tagName: 'AllocationRole', id: 'gateway-t' } },
					projectOwned: true,
					reason: 'decision',
					ambiguous: false,
					selectable: true,
					locked: false,
					candidates: projectCandidates,
				},
			],
			expectedApplied: {
				reportedOnto: 'gateway-t',
				rolePath: 'S1/Gateway',
				roleUuid: 'gateway-project-uuid',
				roleNames: ['Gateway', 'HMI_PC'],
			},
		},
		'the consumer wants a new role although one of that name exists → both create it, under a free name':
			{
				sourceXml,
				targetXml: projectXml,
				chosen: [['role-s', { create: {} }]],
				expectedMappings: [
					{
						id: 'role-s',
						tagName: 'AllocationRole',
						kind: 'shared',
						mapping: { create: { name: 'HMI_PC_1' } },
						// a role of that name exists: the new one is created beside it, under the next free name
						collision: { status: 'resolved', attr: 'name', from: 'HMI_PC', to: 'HMI_PC_1' },
						parentPath: 'S1',
						reason: 'decision',
						ambiguous: false,
						selectable: true,
						locked: false,
						candidates: projectCandidates,
					},
				],
				expectedApplied: {
					reportedOnto: undefined,
					rolePath: 'S1/HMI_PC_1',
					roleNames: ['Gateway', 'HMI_PC', 'HMI_PC_1'],
				},
			},
		'the consumer names the new role → both create it under that name': {
			sourceXml,
			targetXml: projectXml,
			chosen: [['role-s', { create: { name: 'HMI_Bay7' } }]],
			expectedMappings: [
				{
					id: 'role-s',
					tagName: 'AllocationRole',
					kind: 'shared',
					mapping: { create: { name: 'HMI_Bay7' } },
					parentPath: 'S1',
					reason: 'decision',
					ambiguous: false,
					selectable: true,
					locked: false,
					candidates: projectCandidates,
				},
			],
			expectedApplied: {
				reportedOnto: undefined,
				rolePath: 'S1/HMI_Bay7',
				roleNames: ['Gateway', 'HMI_Bay7', 'HMI_PC'],
			},
		},
		'the consumer names the new role with a name already taken → both create it under the next free one':
			{
				sourceXml,
				targetXml: projectXml,
				chosen: [['role-s', { create: { name: 'Gateway' } }]],
				expectedMappings: [
					{
						id: 'role-s',
						tagName: 'AllocationRole',
						kind: 'shared',
						mapping: { create: { name: 'Gateway_1' } },
						// the name asked for is taken: the report says what it became
						collision: { status: 'resolved', attr: 'name', from: 'Gateway', to: 'Gateway_1' },
						parentPath: 'S1',
						reason: 'decision',
						ambiguous: false,
						selectable: true,
						locked: false,
						candidates: projectCandidates,
					},
				],
				expectedApplied: {
					reportedOnto: undefined,
					rolePath: 'S1/Gateway_1',
					roleNames: ['Gateway', 'Gateway_1', 'HMI_PC'],
				},
			},
		'two roles of the template, both to create under one name → the second is reported under the free name apply gives it':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="asd">
						<Substation name="TEMPLATE" ${id}="substation-s">
							<Private type="eIEC61850-6-100" ${id}="private-s">
								<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
								</eIEC61850-6-100:AllocationRole>
								<eIEC61850-6-100:AllocationRole name="RTU" uuid="rtu-source-uuid" ${id}="rtu-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="rtu-function-ref-s"/>
								</eIEC61850-6-100:AllocationRole>
								<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
									<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
										<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
									<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
									<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/RTU" allocationRoleUuid="rtu-source-uuid" ${id}="rtu-ref-s"/>
								</eIEC61850-6-100:Application>
							</Private>
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: projectXml,
				chosen: [
					['role-s', { create: { name: 'Station' } }],
					['rtu-s', { create: { name: 'Station' } }],
				],
				expectedNames: ['Station', 'Station_1'],
				expectedCollisions: [
					undefined,
					{ status: 'resolved', attr: 'name', from: 'Station', to: 'Station_1' },
				],
				expectedMappings: [],
			},
		'a choice for an element the template does not bring → refused': {
			sourceXml,
			targetXml: projectXml,
			chosen: [['not-in-the-template', { create: {} }]],
			expectedRejection: 'no shared element "not-in-the-template"',
			expectedMappings: [],
		},
		'no role of that name in the project → listed as created under its own name': {
			sourceXml,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Substation name="S1" ${id}="substation-t">
						<Private type="eIEC61850-6-100" ${id}="private-t">
							<eIEC61850-6-100:AllocationRole name="Gateway" uuid="gateway-project-uuid" ${id}="gateway-t"/>
							<!-- no AllocationRole named HMI_PC -->
						</Private>
						<VoltageLevel name="V1" ${id}="voltage-level-t">
							<Bay name="B1" ${id}="bay-t"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedMappings: [
				{
					id: 'role-s',
					tagName: 'AllocationRole',
					kind: 'shared',
					mapping: { create: { name: 'HMI_PC' } },
					// created at the level the template holds it on
					parentPath: 'S1',
					reason: 'none',
					ambiguous: false,
					selectable: true,
					locked: false,
					candidates: [projectCandidates[0]],
				},
			],
		},
		'two roles of that name in the project → nothing is picked: the consumer has to choose, apply refuses until then':
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
				expectedMappings: [
					{
						id: 'role-s',
						tagName: 'AllocationRole',
						kind: 'shared',
						// no `mapping`: neither of the two is picked, and none is created behind the consumer's back
						reason: 'name',
						ambiguous: true,
						selectable: true,
						locked: false,
						candidates: [
							// the VoltageLevel of the placement comes before its Substation
							{
								ref: { tagName: 'AllocationRole', id: 'role-t-2' },
								title: 'HMI_PC',
								path: 'S1/V1/HMI_PC',
							},
							{
								ref: { tagName: 'AllocationRole', id: 'role-t' },
								title: 'HMI_PC',
								path: 'S1/HMI_PC',
							},
						],
					},
				],
				expectedNeedsDecisions: true,
				expectedApplyRefusal: 'not decided',
			},
		'roles at several levels of the project → candidates listed from the placement outwards': {
			sourceXml,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Substation name="Other" ${id}="other-substation-t">
						<Private type="eIEC61850-6-100" ${id}="other-private-t">
							<eIEC61850-6-100:AllocationRole name="Archive" uuid="archive-uuid" ${id}="archive-t"/>
						</Private>
					</Substation>
					<Substation name="S1" ${id}="substation-t">
						<Private type="eIEC61850-6-100" ${id}="private-t">
							<eIEC61850-6-100:AllocationRole name="Gateway" uuid="gateway-project-uuid" ${id}="gateway-t"/>
						</Private>
						<VoltageLevel name="V1" ${id}="voltage-level-t">
							<Private type="eIEC61850-6-100" ${id}="voltage-level-private-t">
								<eIEC61850-6-100:AllocationRole name="Station_PC" uuid="station-uuid" ${id}="station-t"/>
							</Private>
							<Bay name="B1" ${id}="bay-t">
								<Private type="eIEC61850-6-100" ${id}="bay-private-t">
									<eIEC61850-6-100:AllocationRole name="Zone_PC" uuid="zone-uuid" ${id}="zone-t"/>
								</Private>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedMappings: [
				{
					id: 'role-s',
					tagName: 'AllocationRole',
					kind: 'shared',
					mapping: { create: { name: 'HMI_PC' } },
					parentPath: 'S1',
					reason: 'none',
					ambiguous: false,
					selectable: true,
					locked: false,
					candidates: [
						// the Bay the application is placed in, then its VoltageLevel, its Substation, the rest
						{
							ref: { tagName: 'AllocationRole', id: 'zone-t' },
							title: 'Zone_PC',
							path: 'S1/V1/B1/Zone_PC',
						},
						{
							ref: { tagName: 'AllocationRole', id: 'station-t' },
							title: 'Station_PC',
							path: 'S1/V1/Station_PC',
						},
						{
							ref: { tagName: 'AllocationRole', id: 'gateway-t' },
							title: 'Gateway',
							path: 'S1/Gateway',
						},
						{
							ref: { tagName: 'AllocationRole', id: 'archive-t' },
							title: 'Archive',
							path: 'Other/Archive',
						},
					],
				},
			],
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'asd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		}
		const decisionMappings = new Map(testCase.chosen ?? [])

		if (testCase.expectedRejection) {
			const refused = report(target.query, {
				...lifecycleTarget,
				resolution: { mappings: decisionMappings },
			})
			await expect(refused).rejects.toThrow(testCase.expectedRejection)
			return
		}

		const reported = await report(target.query, {
			...lifecycleTarget,
			resolution: { mappings: decisionMappings },
		})
		if (testCase.expectedNames) {
			const reportedNames = reported.mappings.map(
				(mapping) => mapping.mapping && 'create' in mapping.mapping && mapping.mapping.create.name,
			)
			expect(reportedNames, 'report').toEqual(testCase.expectedNames)
			if (testCase.expectedCollisions) {
				const reportedCollisions = reported.mappings.map((mapping) => mapping.collision)
				expect(reportedCollisions, 'report').toEqual(testCase.expectedCollisions)
			}
			await target.transaction(async (tx) => {
				await apply(tx, {
					...lifecycleTarget,
					report: reported,
					resolution: { decisions: new Map(), mappings: decisionMappings },
				})
			})
			// each row says the name apply gives that very role
			for (const mapping of reported.mappings) {
				const sourceUuid = await source.query.getAttribute(
					{ tagName: 'AllocationRole', id: mapping.id } as Scl.Ref<'AllocationRole'>,
					{ name: 'uuid' },
				)
				const [created] = await target.query.findByAttributes({
					tagName: 'AllocationRole',
					attributes: { templateUuid: sourceUuid ?? '' },
				})
				const appliedName = await target.query.getAttribute(created, { name: 'name' })
				const reportedName =
					mapping.mapping && 'create' in mapping.mapping ? mapping.mapping.create.name : undefined
				expect(appliedName, `apply, ${mapping.id}`).toBe(reportedName)
			}
			return
		}
		expect(reported.mappings).toEqual(testCase.expectedMappings)
		if (testCase.expectedNeedsDecisions !== undefined) {
			expect(reported.needsDecisions).toBe(testCase.expectedNeedsDecisions)
		}
		if (testCase.expectedApplyRefusal) {
			const refused = target.transaction(async (tx) => {
				await apply(tx, {
					...lifecycleTarget,
					report: reported,
					resolution: { decisions: new Map(), mappings: decisionMappings },
				})
			})
			await expect(refused).rejects.toThrow(testCase.expectedApplyRefusal)
			// the refusal is identified by a key and says what it is about, as data
			const refusal = toDialecteError(await refused.catch((error: unknown) => error))
			expect({ key: refusal?.key, meta: refusal?.meta }).toEqual({
				key: 'MAPPING_UNDECIDED',
				meta: { sourceId: 'role-s', tagName: 'AllocationRole', kind: 'shared' },
			})
			return
		}

		const expectedApplied = testCase.expectedApplied
		if (!expectedApplied) return

		const roleCompanion = allGroups(reported)
			.flatMap((group) => group.companions)
			.find((companion) => companion.tagName === 'AllocationRole')
		expect(roleCompanion?.instanceRef?.id, 'report').toBe(expectedApplied.reportedOnto)

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
		const { allocationRole, allocationRoleUuid } = await target.query.getAttributes(
			roleReferences[0],
		)
		expect(allocationRole, 'apply').toBe(expectedApplied.rolePath)
		if (expectedApplied.roleUuid) {
			expect(allocationRoleUuid, 'apply').toBe(expectedApplied.roleUuid)
		}

		const projectRoles = await target.query.getRecordsByTagName('AllocationRole')
		const roleNames: string[] = []
		for (const role of projectRoles) {
			const name = await target.query.getAttribute(role, { name: 'name' })
			roleNames.push(name ?? '')
		}
		expect(roleNames.sort(), 'apply').toEqual(expectedApplied.roleNames)

		// whatever the role landed on, every reference of the project points at a project element
		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})
