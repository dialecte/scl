import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
const categoryRef = {
	tagName: 'FunctionCategory',
	id: 'category-s',
} as Scl.Ref<'FunctionCategory'>

const voltageLevelRef = {
	tagName: 'VoltageLevel',
	id: 'voltage-level-t',
} as Scl.Ref<'VoltageLevel'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const secondBayRef = { tagName: 'Bay', id: 'bay-2-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The change made to the template once the project holds its two instances. */
	mutate: (tx: Scl.Transaction) => Promise<void>
}

// A function classified by a category. Placed in two bays, both instances share the category the
// first one created, each with its own reference in it.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="category-ref-s"/>
					<!-- gained by the update: <FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot/Trip"/> -->
				</eIEC61850-6-100:FunctionCategory>
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

// The same function, described by a variable instead: a variable the two instances share too.
const variableRef = { tagName: 'Variable', id: 'variable-s' } as Scl.Ref<'Variable'>
const sourceWithVariableXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-source-uuid" ${id}="variable-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="function-source-uuid" ${id}="variable-apply-to-s"/>
					<!-- gained by the update: <VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot/Trip"/> -->
				</eIEC61850-6-100:Variable>
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

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
				<Bay name="B2" ${id}="bay-2-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('lifecycle.apply — an update reaches every instance of a function, each giving a shared element its own references', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two instances sharing a category, and the function of the template gains a subfunction the category classifies → the category gains one reference per instance, each to the subfunction of that instance':
			{
				sourceXml,
				targetXml,
				mutate: async (tx) => {
					await tx.addChild(functionRef, {
						tagName: 'SubFunction',
						attributes: { name: 'Trip', uuid: 'trip-source-uuid' },
					})
					await tx.addChild(categoryRef, {
						tagName: 'FunctionCatRef',
						attributes: {
							function: 'TEMPLATE/TEMPLATE/TEMPLATE/Prot/Trip',
							functionUuid: 'trip-source-uuid',
						},
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionCategory/v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot/Trip"][@functionUuid = //default:Bay[@name="B1"]/default:Function/default:SubFunction[@name="Trip"]/@uuid]',
					'//v2019C1:FunctionCategory/v2019C1:FunctionCatRef[@function="S1/V1/B2/Prot/Trip"][@functionUuid = //default:Bay[@name="B2"]/default:Function/default:SubFunction[@name="Trip"]/@uuid]',
				],
				unexpectedQueries: [
					'//default:Substation[count(.//v2019C1:FunctionCategory) != 1]',
					'//v2019C1:FunctionCategory[count(v2019C1:FunctionCatRef) != 4]',
				],
			},
		'two instances sharing a variable, and the function of the template gains a subfunction the variable applies to → the variable applies to the subfunction of each instance':
			{
				sourceXml: sourceWithVariableXml,
				targetXml,
				mutate: async (tx) => {
					await tx.addChild(functionRef, {
						tagName: 'SubFunction',
						attributes: { name: 'Trip', uuid: 'trip-source-uuid' },
					})
					await tx.addChild(variableRef, {
						tagName: 'VariableApplyTo',
						attributes: {
							element: 'TEMPLATE/TEMPLATE/TEMPLATE/Prot/Trip',
							elementUuid: 'trip-source-uuid',
						},
					})
				},
				expectedQueries: [
					'//v2019C1:Variable/v2019C1:VariableApplyTo[@elementUuid = //default:Bay[@name="B1"]/default:Function/default:SubFunction[@name="Trip"]/@uuid]',
					'//v2019C1:Variable/v2019C1:VariableApplyTo[@elementUuid = //default:Bay[@name="B2"]/default:Function/default:SubFunction[@name="Trip"]/@uuid]',
				],
				unexpectedQueries: [
					'//default:Substation[count(.//v2019C1:Variable) != 1]',
					'//v2019C1:Variable[count(v2019C1:VariableApplyTo) != 4]',
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
			await instantiateFsd(tx, {
				sourceQuery: source.query,
				functionRef,
				targetParent: secondBayRef,
			})
		})
		await source.transaction(testCase.mutate)

		// the update is started from the voltage level holding both bays
		const lifecycleTarget = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: functionRef,
			anchor: voltageLevelRef,
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
