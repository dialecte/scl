import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const functionRoleContentRef = {
	tagName: 'FunctionRoleContent',
	id: 'function-role-content-s',
} as Scl.Ref<'FunctionRoleContent'>
const sourceBayRef = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The project elements the application is instantiated under, one instance each. */
	anchors: Scl.Ref<'Bay'>[]
	/** The change made to the template once the project holds its instances. */
	mutate: (tx: Scl.Transaction) => Promise<void>
}

// An Application composing the function "Prot" and allocating it to the role "HMI_PC".
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

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const secondBayRef = { tagName: 'Bay', id: 'bay-2-t' } as Scl.Ref<'Bay'>
const sourceSubstationRef = { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>

const twoBaysProjectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
				<Bay name="B2" ${id}="bay-2-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('lifecycle.apply — the references an update adds point at the elements of the project', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the template gains a function and a reference to it → the reference points at the function the update instantiates':
			{
				sourceXml,
				targetXml: projectXml,
				anchors: [bayRef],
				mutate: async (tx) => {
					await tx.addChild(sourceBayRef, {
						tagName: 'Function',
						attributes: { name: 'Ctrl', uuid: 'control-source-uuid' },
					})
					await tx.addChild(functionRoleContentRef, {
						tagName: 'FunctionRef',
						attributes: {
							function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
							functionUuid: 'control-source-uuid',
						},
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionRoleContent/v2019C1:FunctionRef[@function="S1/V1/B1/Ctrl"][@functionUuid = //default:Function[@templateUuid="control-source-uuid"]/@uuid]',
				],
			},
		'the template gains a role allocating a function the project already holds → the reference to the role points at the role created, its allocation at the function of the project':
			{
				sourceXml,
				targetXml: projectXml,
				anchors: [bayRef],
				mutate: async (tx) => {
					const role = await tx.addChild(sourceSubstationRef, {
						tagName: 'AllocationRole',
						attributes: { name: 'BAY_CTRL', uuid: 'bay-control-source-uuid' },
					})
					await tx.addChild(role, {
						tagName: 'FunctionRef',
						attributes: {
							function: 'TEMPLATE/TEMPLATE/TEMPLATE/Prot',
							functionUuid: 'function-source-uuid',
						},
					})
					await tx.addChild(applicationRef, {
						tagName: 'AllocationRoleRef',
						attributes: {
							allocationRole: 'TEMPLATE/BAY_CTRL',
							allocationRoleUuid: 'bay-control-source-uuid',
						},
					})
				},
				expectedQueries: [
					'//v2019C1:Application/v2019C1:AllocationRoleRef[@allocationRole="S1/BAY_CTRL"][@allocationRoleUuid = //v2019C1:AllocationRole[@templateUuid="bay-control-source-uuid"]/@uuid]',
					'//v2019C1:AllocationRole[@name="BAY_CTRL"]/v2019C1:FunctionRef[@function="S1/V1/B1/Prot"][@functionUuid = //default:Function[@templateUuid="function-source-uuid"]/@uuid]',
				],
			},
		'two instances of the template, and the application gains a second reference to its function → each instance points at its own function':
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				anchors: [bayRef, secondBayRef],
				mutate: async (tx) => {
					const functionRole = await tx.addChild(applicationRef, {
						tagName: 'FunctionRole',
						attributes: { name: 'BACKUP' },
					})
					const functionRoleContent = await tx.addChild(functionRole, {
						tagName: 'FunctionRoleContent',
						attributes: {},
					})
					await tx.addChild(functionRoleContent, {
						tagName: 'FunctionRef',
						attributes: {
							function: 'TEMPLATE/TEMPLATE/TEMPLATE/Prot',
							functionUuid: 'function-source-uuid',
						},
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionRole[@name="BACKUP"]/v2019C1:FunctionRoleContent/v2019C1:FunctionRef[@function="S1/V1/B1/Prot"]',
					'//v2019C1:FunctionRole[@name="BACKUP"]/v2019C1:FunctionRoleContent/v2019C1:FunctionRef[@function="S1/V1/B2/Prot"]',
				],
				unexpectedQueries: [
					// within one application, both references carry the same function
					'//v2019C1:Application[v2019C1:FunctionRole[@name="BACKUP"]//v2019C1:FunctionRef/@functionUuid != v2019C1:FunctionRole[@name="ROOT"]//v2019C1:FunctionRef/@functionUuid]',
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		for (const anchor of testCase.anchors) {
			await target.transaction(async (tx) => {
				await instantiateAsd(tx, {
					sourceQuery: source.query,
					applicationRef,
					targetParent: anchor,
				})
			})
		}
		await source.transaction(testCase.mutate)

		const lifecycleTarget = {
			verb: 'asd' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: testCase.anchors[0],
		}
		const reported = await report(target.query, lifecycleTarget)
		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: reported,
				resolution: { decisions: new Map() },
			})
		})

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml })).toEqual([])

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
