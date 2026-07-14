import { apply } from './apply'
import { report } from './report'

import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DecisionGroup, DecisionMap } from './engine/diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const categoryRef = { tagName: 'FunctionCategory', id: 'fcat-s' } as Scl.Ref<'FunctionCategory'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}

// A function classified by one FunctionCategory (carried on instantiate).
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="fcat-src-uuid" ${id}="fcat-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="fcatref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="fn-src-uuid" desc="rev1" ${id}="fn-1"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

const skipAll =
	() =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(groups.map((g) => [g.id, 'skip'] as const))

// The template retires the FunctionCategory: the catalog element itself is deleted
// (the FunctionCatRef goes with it), so the instance satellite must be removed on
// accept. The removal rides the function's decision group (bump its desc to form it).
const mutate = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(functionRef, { attributes: { desc: 'rev2' } })
	await tx.delete(categoryRef)
}

describe('lifecycle.apply — removing a retired FunctionCategory (function-layer satellite)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting the function group deletes the retired instance FunctionCategory': {
			sourceXml,
			targetXml,
			mutate,
			decide: () => new Map(),
			expectedQueries: ['//default:Function[@desc="rev2"]'],
			unexpectedQueries: ['//v2019C1:FunctionCategory[@name="MEASUREMENT"]'],
		},

		'skipping the function group keeps the instance FunctionCategory': {
			sourceXml,
			targetXml,
			mutate,
			decide: skipAll(),
			expectedQueries: [
				'//default:Function[@desc="rev1"]',
				'//v2019C1:FunctionCategory[@templateUuid="fcat-src-uuid"][@name="MEASUREMENT"]',
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
		})
		await source.transaction(testCase.mutate)

		const rep = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		})

		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
				decisions: testCase.decide(rep.groups),
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
