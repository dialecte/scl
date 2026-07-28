import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const categoryRef = { tagName: 'FunctionCategory', id: 'cat-s' } as Scl.Ref<'FunctionCategory'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}

// A Function carrying a FunctionCategory satellite (Substation-level, linked by
// FunctionCatRef.functionUuid). The satellite must travel with the function's
// decision group on apply, not just in the report.
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

const skipWhere =
	(predicate: (g: DecisionGroup) => boolean) =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(groups.filter(predicate).map((g) => [g.id, 'skip'] as const))

describe('lifecycle.apply — carried FunctionCategory satellite (full track)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting the function group also updates its carried FunctionCategory': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update(functionRef, { attributes: { desc: 'updated function' } })
				await tx.update(categoryRef, { attributes: { desc: 'updated category' } })
			},
			decide: () => new Map(),
			expectedQueries: [
				'//default:Function[@name="Prot"][@desc="updated function"]',
				'//v2019C1:FunctionCategory[@templateUuid="cat-src-uuid"][@desc="updated category"]',
			],
		},

		'skipping the function group leaves its carried FunctionCategory untouched': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update(functionRef, { attributes: { desc: 'updated function' } })
				await tx.update(categoryRef, { attributes: { desc: 'updated category' } })
			},
			decide: skipWhere(() => true),
			unexpectedQueries: [
				'//default:Function[@name="Prot"][@desc="updated function"]',
				'//v2019C1:FunctionCategory[@desc="updated category"]',
			],
		},

		'satellite-only change (function unchanged) still surfaces + applies on accept': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				// only the satellite changes; the function itself is untouched
				await tx.update(categoryRef, { attributes: { desc: 'satellite only' } })
			},
			decide: () => new Map(),
			expectedQueries: [
				'//v2019C1:FunctionCategory[@templateUuid="cat-src-uuid"][@desc="satellite only"]',
			],
		},

		'satellite-only change is left untouched when skipped': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update(categoryRef, { attributes: { desc: 'satellite only' } })
			},
			decide: skipWhere(() => true),
			unexpectedQueries: ['//v2019C1:FunctionCategory[@desc="satellite only"]'],
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
				decisions: testCase.decide(allGroups(rep)),
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
