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
const substationRef = { tagName: 'Substation', id: 'sub-s' } as Scl.Ref<'Substation'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}

// The function is instantiated WITHOUT a classification; a later template adds a
// FunctionCategory pointing at it. The update must graft the new satellite.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="ln-1" uuid="ln1-uuid"/>
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
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

const skipAll =
	() =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(groups.map((g) => [g.id, 'skip'] as const))

// Add a FunctionCategory (with its FunctionCatRef back to the function) to the
// source AFTER instantiation — the "template gains a classification" case.
const addCategory = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(functionRef, { attributes: { desc: 'updated function' } })
	const category = await tx.addChild(substationRef, {
		tagName: 'FunctionCategory',
		attributes: { name: 'MEASUREMENT', uuid: 'cat-src-uuid' },
	})
	await tx.addChild(category, {
		tagName: 'FunctionCatRef',
		attributes: { functionUuid: 'fn-src-uuid', function: 'TEMPLATE/Prot' },
	})
}

describe('lifecycle.apply — grafting a newly-classified FunctionCategory (full track)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting the function group grafts the added FunctionCategory': {
			sourceXml,
			targetXml,
			mutate: addCategory,
			decide: () => new Map(),
			expectedQueries: [
				'//default:Function[@name="Prot"][@desc="updated function"]',
				'//v2019C1:FunctionCategory[@name="MEASUREMENT"][@templateUuid="cat-src-uuid"]',
				'//v2019C1:FunctionCategory/v2019C1:FunctionCatRef[@functionUuid]',
			],
		},

		'skipping the function group grafts nothing': {
			sourceXml,
			targetXml,
			mutate: addCategory,
			decide: skipAll(),
			unexpectedQueries: [
				'//default:Function[@name="Prot"][@desc="updated function"]',
				'//v2019C1:FunctionCategory[@name="MEASUREMENT"]',
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
