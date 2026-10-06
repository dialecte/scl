import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import {
	asd as instantiateAsd,
	fsd as instantiateFsd,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const sourceFunctionRef = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
const sourceBayRef = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
const functionRoleContentRef = {
	tagName: 'FunctionRoleContent',
	id: 'function-role-content-s',
} as Scl.Ref<'FunctionRoleContent'>

const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const secondBayRef = { tagName: 'Bay', id: 'bay-2-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The project elements the application is instantiated under, one instance each. */
	anchors: Scl.Ref<'Bay'>[]
	/** A function of the template placed on its own under the first anchor, before the update. */
	standingAlone?: Scl.Ref<'Function'>
	/** The change made to the template once the project holds its instances. */
	mutate: (tx: Scl.Transaction) => Promise<void>
	/** The project elements the changed template is instantiated under, before the update. */
	lateAnchors?: Scl.Ref<'Bay'>[]
}

// An Application composing the function "Prot".
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s">
						<!-- gained by the update: <SubFunction name="Trip"/> -->
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same template, holding a function "Ctrl" the application does not compose yet.
const controlFunctionRef = { tagName: 'Function', id: 'control-function-s' } as Scl.Ref<'Function'>
const sourceWithControlXml = sourceXml.replace(
	'</Function>',
	`</Function>
					<Function name="Ctrl" uuid="control-source-uuid" ${id}="control-function-s"/>`,
)

// An Application composing "Prot" and "Ctrl", allocated to the role "HMI_PC" — a role the
// instances of the application share, which lists "Prot" only.
const sharedRoleRef = { tagName: 'AllocationRole', id: 'role-s' } as Scl.Ref<'AllocationRole'>
const sourceWithSharedRoleXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
					<!-- gained by the update: <FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl"/> -->
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source-uuid" ${id}="application-control-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
					<Function name="Ctrl" uuid="control-source-uuid" ${id}="control-function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same template before it holds "Ctrl": the application composes "Prot" only.
const sourceWithSharedRoleWithoutControlXml = sourceWithSharedRoleXml
	.replace(
		`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source-uuid" ${id}="application-control-ref-s"/>`,
		'<!-- gained by the update: <FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl"/> -->',
	)
	.replace(
		`<Function name="Ctrl" uuid="control-source-uuid" ${id}="control-function-s"/>`,
		'<!-- gained by the update: <Function name="Ctrl"/> -->',
	)

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

describe('lifecycle.apply — an update reaches every instance of an application, each where it lives', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two instances in two bays, and a function of the template gains a subfunction → the function of each instance gains it':
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				anchors: [bayRef, secondBayRef],
				mutate: async (tx) => {
					await tx.addChild(sourceFunctionRef, {
						tagName: 'SubFunction',
						attributes: { name: 'Trip', uuid: 'trip-source-uuid' },
					})
				},
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Function[@name="Prot"]/default:SubFunction[@name="Trip"][@templateUuid="trip-source-uuid"]',
					'//default:Bay[@name="B2"]/default:Function[@name="Prot"]/default:SubFunction[@name="Trip"][@templateUuid="trip-source-uuid"]',
				],
			},
		'two instances in the same bay, and the template gains a function and a reference to it → each instance gets its own function and points at it, the function without provenance of its own':
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				anchors: [bayRef, bayRef],
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
					'//default:Bay[@name="B1"][count(default:Function[@templateUuid="control-source-uuid"]) = 2]',
					'//default:Bay[@name="B1"]/default:Function[@name="Ctrl"][@templateUuid="control-source-uuid"]',
					'//default:Bay[@name="B1"]/default:Function[@name="Ctrl_1"][@templateUuid="control-source-uuid"]',
				],
				unexpectedQueries: [
					// placed as part of the application template: its provenance is the application's
					'//v2019C1:FunctionSclRef',
					// no function is shared by the two applications
					'//v2019C1:Application[.//v2019C1:FunctionRef/@functionUuid = preceding::v2019C1:Application//v2019C1:FunctionRef/@functionUuid]',
					// each application refers to one function of each kind
					'//v2019C1:Application[count(.//v2019C1:FunctionRef[@functionUuid = //default:Function[@templateUuid="control-source-uuid"]/@uuid]) != 1]',
					'//default:Bay[@name="B2"]/default:Function',
				],
			},
		'one instance, a function of the template placed on its own in the same bay, and the application gains a reference to it → the reference points at that function, none is added':
			{
				sourceXml: sourceWithControlXml,
				targetXml: twoBaysProjectXml,
				anchors: [bayRef],
				standingAlone: controlFunctionRef,
				mutate: async (tx) => {
					await tx.addChild(functionRoleContentRef, {
						tagName: 'FunctionRef',
						attributes: {
							function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
							functionUuid: 'control-source-uuid',
						},
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionRoleContent/v2019C1:FunctionRef[@function="S1/V1/B1/Ctrl"][@functionUuid = //default:Bay[@name="B1"]/default:Function[@templateUuid="control-source-uuid"]/@uuid]',
				],
				unexpectedQueries: [
					'//default:Bay[count(default:Function[@templateUuid="control-source-uuid"]) > 1]',
				],
			},
		'two instances sharing a role, and the role of the template gains a reference to a function → the role gains one reference per instance, each to the function of that instance':
			{
				sourceXml: sourceWithSharedRoleXml,
				targetXml: twoBaysProjectXml,
				anchors: [bayRef, secondBayRef],
				mutate: async (tx) => {
					await tx.addChild(sharedRoleRef, {
						tagName: 'FunctionRef',
						attributes: {
							function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
							functionUuid: 'control-source-uuid',
						},
					})
				},
				expectedQueries: [
					// what each instance gave the role when it was placed
					'//v2019C1:AllocationRole[@name="HMI_PC"]/v2019C1:FunctionRef[@function="S1/V1/B1/Prot"]',
					'//v2019C1:AllocationRole[@name="HMI_PC"]/v2019C1:FunctionRef[@function="S1/V1/B2/Prot"]',
					// what each instance gives it now
					'//v2019C1:AllocationRole[@name="HMI_PC"]/v2019C1:FunctionRef[@function="S1/V1/B1/Ctrl"][@functionUuid = //default:Bay[@name="B1"]/default:Function[@name="Ctrl"]/@uuid]',
					'//v2019C1:AllocationRole[@name="HMI_PC"]/v2019C1:FunctionRef[@function="S1/V1/B2/Ctrl"][@functionUuid = //default:Bay[@name="B2"]/default:Function[@name="Ctrl"]/@uuid]',
				],
				unexpectedQueries: [
					'//default:Substation[count(.//v2019C1:AllocationRole) != 1]',
					'//v2019C1:AllocationRole[count(v2019C1:FunctionRef) != 4]',
				],
			},
		'an instance placed before the role of the template gained a reference, another placed after → the earlier instance gives the role its own reference too':
			{
				sourceXml: sourceWithSharedRoleXml,
				targetXml: twoBaysProjectXml,
				anchors: [bayRef],
				mutate: async (tx) => {
					await tx.addChild(sharedRoleRef, {
						tagName: 'FunctionRef',
						attributes: {
							function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
							functionUuid: 'control-source-uuid',
						},
					})
				},
				lateAnchors: [secondBayRef],
				expectedQueries: [
					'//v2019C1:AllocationRole[@name="HMI_PC"]/v2019C1:FunctionRef[@function="S1/V1/B1/Ctrl"][@functionUuid = //default:Bay[@name="B1"]/default:Function[@name="Ctrl"]/@uuid]',
					'//v2019C1:AllocationRole[@name="HMI_PC"]/v2019C1:FunctionRef[@function="S1/V1/B2/Ctrl"][@functionUuid = //default:Bay[@name="B2"]/default:Function[@name="Ctrl"]/@uuid]',
				],
				unexpectedQueries: [
					'//default:Substation[count(.//v2019C1:AllocationRole) != 1]',
					'//v2019C1:AllocationRole[count(v2019C1:FunctionRef) != 4]',
				],
			},
		'two instances sharing a role, and the template gains a function the application and the role both refer to → each instance gets its own function, the role one reference to each':
			{
				sourceXml: sourceWithSharedRoleWithoutControlXml,
				targetXml: twoBaysProjectXml,
				anchors: [bayRef, secondBayRef],
				mutate: async (tx) => {
					await tx.addChild(sourceBayRef, {
						tagName: 'Function',
						attributes: { name: 'Ctrl', uuid: 'control-source-uuid' },
					})
					for (const referrer of [functionRoleContentRef, sharedRoleRef]) {
						await tx.addChild(referrer, {
							tagName: 'FunctionRef',
							attributes: {
								function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
								functionUuid: 'control-source-uuid',
							},
						})
					}
				},
				expectedQueries: [
					'//v2019C1:AllocationRole[@name="HMI_PC"]/v2019C1:FunctionRef[@function="S1/V1/B1/Ctrl"][@functionUuid = //default:Bay[@name="B1"]/default:Function[@templateUuid="control-source-uuid"]/@uuid]',
					'//v2019C1:AllocationRole[@name="HMI_PC"]/v2019C1:FunctionRef[@function="S1/V1/B2/Ctrl"][@functionUuid = //default:Bay[@name="B2"]/default:Function[@templateUuid="control-source-uuid"]/@uuid]',
					'//v2019C1:FunctionRoleContent/v2019C1:FunctionRef[@function="S1/V1/B1/Ctrl"]',
					'//v2019C1:FunctionRoleContent/v2019C1:FunctionRef[@function="S1/V1/B2/Ctrl"]',
				],
				unexpectedQueries: [
					'//default:Bay[count(default:Function[@templateUuid="control-source-uuid"]) != 1]',
					'//v2019C1:AllocationRole[count(v2019C1:FunctionRef) != 4]',
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
		const { standingAlone } = testCase
		if (standingAlone) {
			await target.transaction(async (tx) => {
				await instantiateFsd(tx, {
					sourceQuery: source.query,
					functionRef: standingAlone,
					targetParent: testCase.anchors[0],
				})
			})
		}
		await source.transaction(testCase.mutate)
		for (const anchor of testCase.lateAnchors ?? []) {
			await target.transaction(async (tx) => {
				await instantiateAsd(tx, {
					sourceQuery: source.query,
					applicationRef,
					targetParent: anchor,
				})
			})
		}

		// the update is started from where the first instance was placed
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
