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
const variableRef = { tagName: 'Variable', id: 'var-s' } as Scl.Ref<'Variable'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}

// A Variable (cross-cutting satellite) that applies to the function's LNode.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Variable name="Prefix" value="DVNAME" uuid="var-src-uuid" ${id}="var-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/CSWI1" elementUuid="lnode-src-uuid" ${id}="vat-s"/>
				</eIEC61850-6-100:Variable>
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
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

const skipAll =
	() =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(groups.map((g) => [g.id, 'skip'] as const))

const mutate = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(functionRef, { attributes: { desc: 'updated function' } })
	await tx.update(variableRef, { attributes: { desc: 'updated variable' } })
}

describe('lifecycle.apply — carried Variable (cross-cutting satellite)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting the function group also updates the Variable that applies to it': {
			sourceXml,
			targetXml,
			mutate,
			decide: () => new Map(),
			expectedQueries: [
				'//default:Function[@name="Prot"][@desc="updated function"]',
				'//v2019C1:Variable[@templateUuid="var-src-uuid"][@desc="updated variable"]',
			],
		},

		'skipping the function group leaves the Variable untouched': {
			sourceXml,
			targetXml,
			mutate,
			decide: skipAll(),
			unexpectedQueries: [
				'//default:Function[@name="Prot"][@desc="updated function"]',
				'//v2019C1:Variable[@desc="updated variable"]',
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
