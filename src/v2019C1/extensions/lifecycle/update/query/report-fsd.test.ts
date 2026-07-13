import { reportFsd } from './report-fsd'

import { describe, expect } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const categoryRef = { tagName: 'FunctionCategory', id: 'cat-s' } as Scl.Ref<'FunctionCategory'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate?: (tx: Scl.Transaction) => Promise<void>
}

// A Function that carries a FunctionCategory classification. The category lives at
// Substation level (a satellite OUTSIDE the Function subtree), linked back to the
// function by `FunctionCatRef.functionUuid`.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="cat-src-uuid" ${id}="cat-s">
					<eIEC61850-6-100:FunctionCatRef functionUuid="fn-src-uuid" function="TEMPLATE/Prot" ${id}="catref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

describe('reportFsd (function layer + carried FunctionCategory satellite)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a change to the carried FunctionCategory is a companion of the function group': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				// change the function itself...
				await tx.update(functionRef, { attributes: { desc: 'updated function' } })
				// ...and its carried satellite (lives outside the Function subtree)
				await tx.update(categoryRef, { attributes: { desc: 'updated category' } })
			},
		},
	}

	async function act({ source, target, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		if (testCase.mutate) await source.transaction(testCase.mutate)

		const report = await reportFsd(target.query, {
			sourceQuery: source.query,
			functionRef,
			targetParent: bayRef,
		})

		expect(report.needsDecisions).toBe(true)

		const functionGroup = report.groups.find((group) => group.primary.tagName === 'Function')
		expect(functionGroup).toBeDefined()

		// the carried FunctionCategory change must travel as a companion of the
		// function's decision group (G6), never its own card and never dropped.
		const companionTags = functionGroup!.companions.map((node) => node.tagName)
		expect(companionTags).toContain('FunctionCategory')
	}

	runSclTestCases.withoutExport({ testCases, act })
})
