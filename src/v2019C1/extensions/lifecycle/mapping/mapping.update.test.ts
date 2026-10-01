import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { DecisionMapping, ReportMapping } from './mapping.types'
import type { Scl } from '@/v2019C1/config'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const projectRoleRef = { tagName: 'AllocationRole', id: 'role-t' } as Scl.Ref<'AllocationRole'>
const sourceRoleRef = { tagName: 'AllocationRole', id: 'role-s' } as Scl.Ref<'AllocationRole'>

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

// A project whose role "HMI_PC" has its own description and already serves a function of the project.
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" desc="Operator workstation" uuid="role-project-uuid" ${id}="role-t">
					<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Local" functionUuid="local-function-uuid" ${id}="role-function-ref-t"/>
				</eIEC61850-6-100:AllocationRole>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Function name="Local" uuid="local-function-uuid" ${id}="local-function-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// An Application composing two functions, each allocated to its own role.
const twoRolesSourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:AllocationRole name="BAY_CTRL" uuid="control-role-source-uuid" ${id}="control-role-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source-uuid" ${id}="control-role-function-ref-s"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source-uuid" ${id}="application-control-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/BAY_CTRL" allocationRoleUuid="control-role-source-uuid" ${id}="control-role-ref-s"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
					<Function name="Ctrl" uuid="control-source-uuid" ${id}="control-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same Application, whose roles allocate nothing.
const twoBareRolesSourceXml = twoRolesSourceXml
	.replace(
		/<eIEC61850-6-100:AllocationRole name="HMI_PC"[\s\S]*?<\/eIEC61850-6-100:AllocationRole>/,
		`<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s"/>`,
	)
	.replace(
		/<eIEC61850-6-100:AllocationRole name="BAY_CTRL"[\s\S]*?<\/eIEC61850-6-100:AllocationRole>/,
		`<eIEC61850-6-100:AllocationRole name="BAY_CTRL" uuid="control-role-source-uuid" ${id}="control-role-s"/>`,
	)

// The Application of the first template, whose role allocates nothing.
const bareRoleSourceXml = sourceXml.replace(
	/<eIEC61850-6-100:AllocationRole name="HMI_PC"[\s\S]*?<\/eIEC61850-6-100:AllocationRole>/,
	`<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s"/>`,
)

// A project holding both roles.
const twoRolesProjectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-project-uuid" ${id}="role-t"/>
				<eIEC61850-6-100:AllocationRole name="BAY_CTRL" uuid="control-role-project-uuid" ${id}="control-role-t"/>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectControlRoleRef = {
	tagName: 'AllocationRole',
	id: 'control-role-t',
} as Scl.Ref<'AllocationRole'>

const renamedProjectRoles = [
	{ ref: projectControlRoleRef, title: 'Controller', path: 'S1/Controller' },
	{ ref: projectRoleRef, title: 'Workstation', path: 'S1/Workstation' },
]

/** The project's author renames both roles. */
const renameBothProjectRoles = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(projectRoleRef, { attributes: { name: 'Workstation' } })
	await tx.update(projectControlRoleRef, { attributes: { name: 'Controller' } })
}

// A project with no role at all.
const projectWithoutRoleXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const createdRoleRef = { tagName: 'AllocationRole', id: '<created>' } as Scl.Ref<'AllocationRole'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The consumer's choices at the first instantiate, by source record id. */
	chosenAtInstantiate?: [string, DecisionMapping][]
	/** The consumer's choices at the update, by source record id. */
	chosenAtUpdate?: [string, DecisionMapping][]
	/** Place the template a second time instead of updating its instance. */
	instantiateAgain?: boolean
	/** Apply the update without decisions: what a consumer does when the report asks for none. */
	headless?: boolean
	/** What the project's author changes between the instantiate and the update. */
	editProject?: (tx: Scl.Transaction) => Promise<void>
	/** What the template's author changes between the instantiate and the update. */
	editTemplate: (tx: Scl.Transaction) => Promise<void>
	expected: {
		/** What the update's report lists. */
		mappings: ReportMapping[]
		/** How many roles the report announces as new. */
		announcedNewRoles: number
		/** How many allocations of the source role the report announces as new. */
		announcedNewAllocations: number
		/** Names of every AllocationRole of the project once updated. */
		roleNames: string[]
		/** The roles the Application refers to once updated, by path. */
		applicationRoles: string[]
		/** The description of the role the Application refers to, once updated. */
		roleDescription: string | undefined
		/** The functions that role allocates once updated, by path. */
		roleAllocations: string[]
	}
}

/** A report node and every node below it. */
function flattenNodes(node: DiffNode): DiffNode[] {
	return [node, ...node.children.flatMap(flattenNodes)]
}

/** The record id standing, in an expected mapping, for an element the instantiate created. */
const CREATED = createdRoleRef.id

const describeTemplateRevision = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(applicationRef, { attributes: { desc: 'revision 2' } })
}

/** The template gains the function "Ctrl", composed by the Application and allocated to its role. */
const allocateSecondFunction = async (tx: Scl.Transaction): Promise<void> => {
	await tx.addChild({ tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>, {
		tagName: 'Function',
		attributes: { name: 'Ctrl', uuid: 'control-source-uuid' },
	})
	const controlReference = {
		tagName: 'FunctionRef' as const,
		attributes: {
			function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
			functionUuid: 'control-source-uuid',
		},
	}
	await tx.addChild(
		{
			tagName: 'FunctionRoleContent',
			id: 'function-role-content-s',
		} as Scl.Ref<'FunctionRoleContent'>,
		controlReference,
	)
	await tx.addChild(sourceRoleRef, controlReference)
}

/** What an update lists for the source role once an instantiate mapped it onto the project's role. */
const lockedOntoProjectRole: ReportMapping = {
	id: 'role-s',
	tagName: 'AllocationRole',
	mapping: { existing: projectRoleRef },
	reason: 'lineage',
	ambiguous: false,
	selectable: true,
	locked: true,
	candidates: [{ ref: projectRoleRef, title: 'HMI_PC', path: 'S1/HMI_PC' }],
}

describe('shared-element mapping — an update finds the mapping the instantiate made', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the role was mapped onto a project role → the update lists it as mapped there, locked, and leaves the role as it is':
			{
				sourceXml,
				targetXml: projectXml,
				editTemplate: describeTemplateRevision,
				expected: {
					mappings: [lockedOntoProjectRole],
					announcedNewRoles: 0,
					announcedNewAllocations: 0,
					roleNames: ['HMI_PC'],
					applicationRoles: ['S1/HMI_PC'],
					roleDescription: 'Operator workstation',
					roleAllocations: ['S1/V1/B1/Local', 'S1/V1/B1/Prot'],
				},
			},
		'nothing changed in the template, applied without decisions → the project role keeps its own allocation':
			{
				sourceXml,
				targetXml: projectXml,
				headless: true,
				editTemplate: async () => {},
				expected: {
					mappings: [lockedOntoProjectRole],
					announcedNewRoles: 0,
					announcedNewAllocations: 0,
					roleNames: ['HMI_PC'],
					applicationRoles: ['S1/HMI_PC'],
					roleDescription: 'Operator workstation',
					roleAllocations: ['S1/V1/B1/Local', 'S1/V1/B1/Prot'],
				},
			},
		'the template role gains an allocation → it is added to the project role, whose own description and allocation stay':
			{
				sourceXml,
				targetXml: projectXml,
				editTemplate: allocateSecondFunction,
				expected: {
					mappings: [lockedOntoProjectRole],
					announcedNewRoles: 0,
					announcedNewAllocations: 1,
					roleNames: ['HMI_PC'],
					applicationRoles: ['S1/HMI_PC'],
					roleDescription: 'Operator workstation',
					roleAllocations: ['S1/V1/B1/Ctrl', 'S1/V1/B1/Local', 'S1/V1/B1/Prot'],
				},
			},
		'the role was created by the instantiate → the update finds it by its lineage and reconciles it in full, description included':
			{
				sourceXml,
				targetXml: projectWithoutRoleXml,
				editTemplate: async (tx) => {
					await tx.update(sourceRoleRef, { attributes: { desc: 'Role, revision 2' } })
					await allocateSecondFunction(tx)
				},
				expected: {
					mappings: [
						{
							...lockedOntoProjectRole,
							mapping: { existing: createdRoleRef },
							candidates: [{ ref: createdRoleRef, title: 'HMI_PC', path: 'S1/HMI_PC' }],
						},
					],
					announcedNewRoles: 0,
					announcedNewAllocations: 1,
					roleNames: ['HMI_PC'],
					applicationRoles: ['S1/HMI_PC'],
					roleDescription: 'Role, revision 2',
					roleAllocations: ['S1/V1/B1/Ctrl', 'S1/V1/B1/Prot'],
				},
			},
		'the role was created by a first instantiate and renamed since → a second instantiate proposes that role, and the consumer may still choose':
			{
				sourceXml,
				targetXml: projectWithoutRoleXml,
				instantiateAgain: true,
				editProject: async (tx) => {
					const [createdRole] = await tx.getRecordsByTagName('AllocationRole')
					await tx.update(createdRole, { attributes: { name: 'Workstation' } })
				},
				editTemplate: async () => {},
				expected: {
					mappings: [
						{
							id: 'role-s',
							tagName: 'AllocationRole',
							mapping: { existing: createdRoleRef },
							reason: 'lineage',
							ambiguous: false,
							selectable: true,
							locked: false,
							candidates: [{ ref: createdRoleRef, title: 'Workstation', path: 'S1/Workstation' }],
						},
					],
					announcedNewRoles: 0,
					announcedNewAllocations: 1,
					roleNames: ['Workstation'],
					applicationRoles: ['S1/Workstation'],
					roleDescription: undefined,
					roleAllocations: ['S1/V1/B1/Prot', 'S1/V1/B1/Prot_1'],
				},
			},
		'the project role was renamed since the instantiate → the update still finds it, by what the mapping gave it':
			{
				sourceXml,
				targetXml: projectXml,
				editProject: async (tx) => {
					await tx.update(projectRoleRef, { attributes: { name: 'Workstation' } })
				},
				editTemplate: allocateSecondFunction,
				expected: {
					mappings: [
						{
							...lockedOntoProjectRole,
							candidates: [{ ref: projectRoleRef, title: 'Workstation', path: 'S1/Workstation' }],
						},
					],
					announcedNewRoles: 0,
					announcedNewAllocations: 1,
					roleNames: ['Workstation'],
					applicationRoles: ['S1/Workstation'],
					roleDescription: 'Operator workstation',
					roleAllocations: ['S1/V1/B1/Ctrl', 'S1/V1/B1/Local', 'S1/V1/B1/Prot'],
				},
			},
		'a role that allocates nothing, mapped by choice onto a project role of another name → found as the one role the application refers to':
			{
				sourceXml: bareRoleSourceXml,
				targetXml: twoRolesProjectXml,
				chosenAtInstantiate: [['role-s', { existing: projectControlRoleRef }]],
				editTemplate: describeTemplateRevision,
				expected: {
					mappings: [
						{
							...lockedOntoProjectRole,
							mapping: { existing: projectControlRoleRef },
							candidates: [{ ref: projectControlRoleRef, title: 'BAY_CTRL', path: 'S1/BAY_CTRL' }],
						},
					],
					announcedNewRoles: 0,
					announcedNewAllocations: 0,
					roleNames: ['BAY_CTRL', 'HMI_PC'],
					applicationRoles: ['S1/BAY_CTRL'],
					roleDescription: undefined,
					roleAllocations: [],
				},
			},
		'two roles mapped onto project roles, both renamed since → each is found by the function it was given':
			{
				sourceXml: twoRolesSourceXml,
				targetXml: twoRolesProjectXml,
				editProject: renameBothProjectRoles,
				editTemplate: describeTemplateRevision,
				expected: {
					mappings: [
						{
							...lockedOntoProjectRole,
							candidates: [{ ref: projectRoleRef, title: 'Workstation', path: 'S1/Workstation' }],
						},
						{
							...lockedOntoProjectRole,
							id: 'control-role-s',
							mapping: { existing: projectControlRoleRef },
							candidates: [
								{ ref: projectControlRoleRef, title: 'Controller', path: 'S1/Controller' },
							],
						},
					],
					announcedNewRoles: 0,
					announcedNewAllocations: 0,
					roleNames: ['Controller', 'Workstation'],
					applicationRoles: ['S1/Controller', 'S1/Workstation'],
					roleDescription: undefined,
					roleAllocations: ['S1/V1/B1/Prot'],
				},
			},
		'two roles that allocate nothing, mapped onto project roles, both renamed since → nothing tells them apart: listed as new, flagged ambiguous, for the consumer to map':
			{
				sourceXml: twoBareRolesSourceXml,
				targetXml: twoRolesProjectXml,
				editProject: renameBothProjectRoles,
				editTemplate: describeTemplateRevision,
				expected: {
					mappings: [
						{
							id: 'role-s',
							tagName: 'AllocationRole',
							mapping: { create: { name: 'HMI_PC' } },
							reason: 'none',
							ambiguous: true,
							selectable: true,
							locked: false,
							candidates: renamedProjectRoles,
						},
						{
							id: 'control-role-s',
							tagName: 'AllocationRole',
							mapping: { create: { name: 'BAY_CTRL' } },
							reason: 'none',
							ambiguous: true,
							selectable: true,
							locked: false,
							candidates: renamedProjectRoles,
						},
					],
					announcedNewRoles: 2,
					announcedNewAllocations: 0,
					roleNames: ['BAY_CTRL', 'Controller', 'HMI_PC', 'Workstation'],
					applicationRoles: ['S1/BAY_CTRL', 'S1/HMI_PC'],
					roleDescription: undefined,
					roleAllocations: [],
				},
			},
		'… and the consumer maps each onto its project role → the update keeps the project roles': {
			sourceXml: twoBareRolesSourceXml,
			targetXml: twoRolesProjectXml,
			editProject: renameBothProjectRoles,
			editTemplate: describeTemplateRevision,
			chosenAtUpdate: [
				['role-s', { existing: projectRoleRef }],
				['control-role-s', { existing: projectControlRoleRef }],
			],
			expected: {
				mappings: [
					{
						id: 'role-s',
						tagName: 'AllocationRole',
						mapping: { existing: projectRoleRef },
						reason: 'decision',
						ambiguous: false,
						selectable: true,
						locked: false,
						candidates: renamedProjectRoles,
					},
					{
						id: 'control-role-s',
						tagName: 'AllocationRole',
						mapping: { existing: projectControlRoleRef },
						reason: 'decision',
						ambiguous: false,
						selectable: true,
						locked: false,
						candidates: renamedProjectRoles,
					},
				],
				announcedNewRoles: 0,
				announcedNewAllocations: 0,
				roleNames: ['Controller', 'Workstation'],
				applicationRoles: ['S1/Controller', 'S1/Workstation'],
				roleDescription: undefined,
				roleAllocations: [],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'asd' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		}

		const projectRolesAtStart = await target.query.getRecordsByTagName('AllocationRole')
		const projectRoleIdsAtStart = new Set(projectRolesAtStart.map((role) => role.id))
		const nameCreated = (ref: Scl.Ref<Scl.ElementsOf>): Scl.Ref<Scl.ElementsOf> =>
			ref.id && projectRoleIdsAtStart.has(ref.id) ? ref : { ...ref, id: CREATED }

		// 1. first instantiate, with the consumer's choices
		const decisionMappings = new Map(testCase.chosenAtInstantiate ?? [])
		const instantiateReport = await report(target.query, {
			...lifecycleTarget,
			scenario: 'instantiate',
			resolution: { mappings: decisionMappings },
		})
		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				scenario: 'instantiate',
				report: instantiateReport,
				resolution: { decisions: new Map(), mappings: decisionMappings },
			})
		})

		// 2. both sides move on
		if (testCase.editProject) await target.transaction(testCase.editProject)
		await source.transaction(testCase.editTemplate)

		// 3. the update
		const updateDecisionMappings = new Map(testCase.chosenAtUpdate ?? [])
		const updateTarget = {
			...lifecycleTarget,
			scenario: testCase.instantiateAgain ? ('instantiate' as const) : ('template' as const),
		}
		const updateReport = await report(target.query, {
			...updateTarget,
			resolution: { mappings: updateDecisionMappings },
		})
		const reportedMappings = updateReport.mappings.map((mapping) => ({
			...mapping,
			mapping:
				'existing' in mapping.mapping
					? { existing: nameCreated(mapping.mapping.existing) }
					: mapping.mapping,
			candidates: mapping.candidates.map((candidate) => ({
				...candidate,
				ref: nameCreated(candidate.ref),
			})),
		}))
		expect(reportedMappings, 'report').toEqual(testCase.expected.mappings)

		// a node may be reached through its own group and through its parent's: count it once
		const announced = [
			...new Set(
				allGroups(updateReport).flatMap((group) =>
					[group.primary, ...group.companions].flatMap(flattenNodes),
				),
			),
		]
		const announcedNewRoles = announced.filter(
			(node) => node.tagName === 'AllocationRole' && node.change === 'added',
		)
		expect(announcedNewRoles.length, 'report').toBe(testCase.expected.announcedNewRoles)

		const { FunctionRef: sourceAllocations = [] } = await source.query.findDescendants(
			sourceRoleRef,
			{ collect: 'FunctionRef' },
		)
		const sourceAllocationIds = new Set(sourceAllocations.map((allocation) => allocation.id))
		const announcedNewAllocations = announced.filter(
			(node) =>
				node.change === 'added' && node.sourceRef?.id && sourceAllocationIds.has(node.sourceRef.id),
		)
		expect(announcedNewAllocations.length, 'report').toBe(testCase.expected.announcedNewAllocations)

		await target.transaction(async (tx) => {
			await apply(tx, {
				...updateTarget,
				report: updateReport,
				resolution: testCase.headless
					? { mappings: updateDecisionMappings }
					: { decisions: new Map(), mappings: updateDecisionMappings },
			})
		})

		const projectRoles = await target.query.getRecordsByTagName('AllocationRole')
		const roleNames: string[] = []
		for (const role of projectRoles) {
			const name = await target.query.getAttribute(role, { name: 'name' })
			roleNames.push(name ?? '')
		}
		expect(roleNames.sort(), 'apply').toEqual(testCase.expected.roleNames)

		const [applicationInstance] = await target.query.findByAttributes({
			tagName: 'Application',
			attributes: { templateUuid: 'application-source-uuid' },
		})
		const { AllocationRoleRef: roleReferences = [] } = await target.query.findDescendants(
			{ tagName: 'Application', id: applicationInstance.id },
			{ collect: 'AllocationRoleRef' },
		)
		const applicationRoles: string[] = []
		for (const roleReference of roleReferences) {
			const rolePath = await target.query.getAttribute(roleReference, { name: 'allocationRole' })
			applicationRoles.push(rolePath ?? '')
		}
		expect(applicationRoles.sort(), 'apply').toEqual(testCase.expected.applicationRoles)

		const referencedRoleUuid = await target.query.getAttribute(roleReferences[0], {
			name: 'allocationRoleUuid',
		})
		const [referencedRole] = await target.query.findByAttributes({
			tagName: 'AllocationRole',
			attributes: { uuid: referencedRoleUuid },
		})
		const roleDescription = await target.query.getAttribute(referencedRole, { name: 'desc' })
		expect(roleDescription || undefined, 'apply').toBe(testCase.expected.roleDescription)

		const { FunctionRef: allocations = [] } = await target.query.findDescendants(
			{ tagName: 'AllocationRole', id: referencedRole.id },
			{ collect: 'FunctionRef' },
		)
		const roleAllocations: string[] = []
		for (const allocation of allocations) {
			const functionPath = await target.query.getAttribute(allocation, { name: 'function' })
			roleAllocations.push(functionPath ?? '')
		}
		expect(roleAllocations.sort(), 'apply').toEqual(testCase.expected.roleAllocations)

		// whatever the role landed on, every reference of the project points at a project element
		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// A bay typical whose application allocates its function to the role "HMI_PC"; both sit in the bay.
const typicalXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="Feeder" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="private-s">
						<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
						</eIEC61850-6-100:AllocationRole>
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/Feeder/HMI_PC" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project holding a role of its own, "Gateway".
const projectWithGatewayXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:AllocationRole name="Gateway" uuid="gateway-project-uuid" ${id}="gateway-t"/>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t"/>
		</Substation>
	</SCL>
`

const typicalBayRef = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
const voltageLevelRef = {
	tagName: 'VoltageLevel',
	id: 'voltage-level-t',
} as Scl.Ref<'VoltageLevel'>
const gatewayRef = { tagName: 'AllocationRole', id: 'gateway-t' } as Scl.Ref<'AllocationRole'>

type TypicalTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The consumer's choice, at the update, for the role the typical gained. */
	chosenForGainedRole: DecisionMapping
	expected: {
		/** Where the update's report says the role the typical gained lands. */
		gainedRoleMapping: DecisionMapping
		/** Names of every AllocationRole of the project once updated. */
		roleNames: string[]
		/** The roles the Application refers to once updated, by path. */
		applicationRoles: string[]
	}
}

describe('shared-element mapping — an update of a bay typical brings a role the instance does not hold', () => {
	const testCases: SclTest.TestCases<TypicalTestCase> = {
		'the consumer maps the role the typical gained onto a project role → no role is created, the application refers to the project role':
			{
				sourceXml: typicalXml,
				targetXml: projectWithGatewayXml,
				chosenForGainedRole: { existing: gatewayRef },
				expected: {
					gainedRoleMapping: { existing: gatewayRef },
					roleNames: ['Gateway', 'HMI_PC'],
					applicationRoles: ['S1/Gateway', 'S1/V1/Feeder/HMI_PC'],
				},
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TypicalTestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'ssd' as const,
			sourceQuery: source.query,
			ref: typicalBayRef,
			anchor: voltageLevelRef,
		}

		// 1. the typical is placed: its role is created with the bay
		const instantiateReport = await report(target.query, lifecycleTarget)
		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycleTarget, report: instantiateReport })
		})

		// 2. the typical gains a role, which its application refers to
		let gainedRoleId = ''
		await source.transaction(async (tx) => {
			const gainedRole = await tx.addChild(typicalBayRef, {
				tagName: 'AllocationRole',
				attributes: { name: 'BAY_CTRL', uuid: 'gained-role-source-uuid' },
			})
			gainedRoleId = gainedRole.id
			await tx.addChild(applicationRef, {
				tagName: 'AllocationRoleRef',
				attributes: {
					allocationRole: 'TEMPLATE/TEMPLATE/Feeder/BAY_CTRL',
					allocationRoleUuid: 'gained-role-source-uuid',
				},
			})
		})

		// 3. the update, with the consumer's choice
		const decisionMappings = new Map([[gainedRoleId, testCase.chosenForGainedRole]])
		const updateReport = await report(target.query, {
			...lifecycleTarget,
			resolution: { mappings: decisionMappings },
		})
		const gainedRoleMapping = updateReport.mappings.find((mapping) => mapping.id === gainedRoleId)
		expect(gainedRoleMapping?.mapping, 'report').toEqual(testCase.expected.gainedRoleMapping)

		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: updateReport,
				resolution: { decisions: new Map(), mappings: decisionMappings },
			})
		})

		const projectRoles = await target.query.getRecordsByTagName('AllocationRole')
		const roleNames: string[] = []
		for (const role of projectRoles) {
			const name = await target.query.getAttribute(role, { name: 'name' })
			roleNames.push(name ?? '')
		}
		expect(roleNames.sort(), 'apply').toEqual(testCase.expected.roleNames)

		const roleReferences = await target.query.getRecordsByTagName('AllocationRoleRef')
		const applicationRoles: string[] = []
		for (const roleReference of roleReferences) {
			const rolePath = await target.query.getAttribute(roleReference, { name: 'allocationRole' })
			applicationRoles.push(rolePath ?? '')
		}
		expect(applicationRoles.sort(), 'apply').toEqual(testCase.expected.applicationRoles)

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})
