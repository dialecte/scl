import { reportFsd } from './report-fsd'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
}

// A Function carrying a FunctionCategory satellite. On FIRST-TIME instantiate (no
// existing instance in the target) the satellite is still created via the clone path,
// so the report must surface it as an `added` companion of the function's group —
// otherwise the merge-review hides it when context is off.
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

describe('reportFsd — first-time instantiate carries the FunctionCategory satellite', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"the carried FunctionCategory is an added companion of the function's group": {
			sourceXml,
			targetXml,
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const report = await reportFsd(target.query, {
			sourceQuery: source.query,
			functionRef,
			targetParent: bayRef,
			scenario: 'instantiate',
		})

		const functionGroup = allGroups(report).find((group) => group.primary.tagName === 'Function')
		expect(functionGroup).toBeDefined()

		const category = functionGroup!.companions.find((node) => node.tagName === 'FunctionCategory')
		expect(category).toBeDefined()
		expect(category!.change).toBe('added')
	}

	runSclTestCases.withoutExport({ testCases, act })
})
