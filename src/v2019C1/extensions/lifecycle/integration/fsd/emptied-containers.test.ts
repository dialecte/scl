import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'prot-s' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

/** A function template whose category is the only content of its substation's wrapper. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="substation-private-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-template-uuid" ${id}="category-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-template-uuid" ${id}="category-ref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="prot-template-uuid" ${id}="prot-s"/>
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
			</VoltageLevel>
		</Substation>
	</SCL>
`

// What an update removes leaves no wrapper or container emptied behind it.
describe('fsd update: a container the update empties goes with what it held', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase & { targetXml: string }> = {
		'the template retires its last category: the substation keeps no empty wrapper': {
			sourceXml,
			targetXml,
			expectedQueries: ['//default:Function[@name="Prot"][@desc="rev2"]'],
			unexpectedQueries: ['//v2019C1:FunctionCategory', '//default:Substation/default:Private'],
		},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<
		SclTest.BaseXmlTestCase & { targetXml: string }
	>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function placeTheFunction(tx) {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		await source.transaction(async function retireTheCategory(tx) {
			await tx.update(functionRef, { attributes: { desc: 'rev2' } })
			await tx.delete({ tagName: 'FunctionCategory', id: 'category-s' })
		})
		const lifecycle: LifecycleTarget = {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
			scenario: 'template',
		}
		const reported = await report(target.query, lifecycle)
		await target.transaction(async function applyTheUpdate(tx) {
			await apply(tx, { ...lifecycle, report: reported, resolution: { decisions: new Map() } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
