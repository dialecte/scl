import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const subCategoryRef = { tagName: 'SubCategory', id: 'subcat-s' } as Scl.Ref<'SubCategory'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

// A FunctionCategory satellite whose FunctionCatRef is NESTED inside a SubCategory.
// A template change on the SubCategory (a descendant of the satellite root) must
// travel with the function's decision group on apply — the generic "nested change
// inside a satellite subtree" case (not just the satellite root's own attributes).
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="cat-src-uuid" ${id}="cat-s">
					<eIEC61850-6-100:SubCategory name="CURRENT" uuid="subcat-src-uuid" desc="rev1 sub" ${id}="subcat-s">
						<eIEC61850-6-100:FunctionCatRef functionUuid="fn-src-uuid" function="TEMPLATE/Prot" ${id}="catref-s"/>
					</eIEC61850-6-100:SubCategory>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
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

describe('lifecycle.apply — nested change inside a FunctionCategory satellite', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting the function group also updates a NESTED SubCategory of the satellite': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update(functionRef, { attributes: { desc: 'updated function' } })
				await tx.update(subCategoryRef, { attributes: { desc: 'rev2 sub' } })
			},
			decide: () => new Map(),
			expectedQueries: [
				'//default:Function[@name="Prot"][@desc="updated function"]',
				'//v2019C1:SubCategory[@templateUuid="subcat-src-uuid"][@desc="rev2 sub"]',
			],
			unexpectedQueries: [
				// the stale rev1 value must not survive the reconcile
				'//v2019C1:SubCategory[@desc="rev1 sub"]',
			],
		},

		'skipping the function group leaves the nested SubCategory untouched': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update(functionRef, { attributes: { desc: 'updated function' } })
				await tx.update(subCategoryRef, { attributes: { desc: 'rev2 sub' } })
			},
			decide: skipAll(),
			expectedQueries: ['//v2019C1:SubCategory[@desc="rev1 sub"]'],
			unexpectedQueries: ['//v2019C1:SubCategory[@desc="rev2 sub"]'],
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

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}
