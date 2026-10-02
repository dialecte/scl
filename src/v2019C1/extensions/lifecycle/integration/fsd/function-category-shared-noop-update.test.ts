import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const secondBayRef = { tagName: 'Bay', id: 'bay-2-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// A function classified by a FunctionCategory. Instantiated in two bays, both instances share the
// category the first one created, each with its own FunctionCatRef in it.

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="cat-src-uuid" ${id}="cat-s">
					<eIEC61850-6-100:FunctionCatRef functionUuid="fn-src-uuid" function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" ${id}="catref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
				<Bay name="B2" ${id}="bay-2-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('lifecycle.apply — an update with nothing to do leaves a shared FunctionCategory as it is', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two instances share the category, one is updated without any change → the other keeps its reference in it':
			{
				sourceXml,
				targetXml,
				expectedQueries: [
					'//v2019C1:FunctionCategory/v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]',
					'//v2019C1:FunctionCategory/v2019C1:FunctionCatRef[@function="S1/V1/B2/Prot"]',
				],
			},
	}
	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
			await instantiateFsd(tx, {
				sourceQuery: source.query,
				functionRef,
				targetParent: secondBayRef,
			})
		})

		// the template did not change: the report asks for no decision, the consumer applies as is
		const lifecycleTarget = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		}
		const reported = await report(target.query, lifecycleTarget)
		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycleTarget, report: reported })
		})

		return { assertOn: 'target' }
	}
	runSclTestCases.withExport({ testCases, act })
})
