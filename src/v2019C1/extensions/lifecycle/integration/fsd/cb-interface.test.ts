import { apply } from '../apply'
import { report } from '../report'

import { createMockRandomUUID } from '@dialecte/core/test'
import { describe, expect, test } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { DecisionGroup, DecisionMap } from '../engine/diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// Integration test distilled from the hand-written `CB APP/CB Interface rev1→rev2.fsd`
// pair (2019C1). The real uuids are kept for traceability; the structure is reduced
// to the lifecycle-relevant core and counter-checked against the Dialecte definition:
//  - FunctionCategory lives under Substation (valid parent) — NOT under the Function
//    (the definition forbids it; a Private wrapper is transparent);
//  - Function under Bay, LNode under Function, Variable under Substation.
// rev1→rev2 exercises: attribute reconcile on the function + both satellites, and a
// grafted new LNode — all through the two-track report/apply seam.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const FN_UUID = 'd996cde9-fc40-4510-8b08-d685da2be6e5' // real CB Interface function uuid
const FCAT_UUID = 'b159f5e3-d97c-430d-8664-95b5cfed7c44' // real INTERFACE FCAT uuid

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const categoryRef = { tagName: 'FunctionCategory', id: 'fcat-s' } as Scl.Ref<'FunctionCategory'>
const variableRef = { tagName: 'Variable', id: 'var-s' } as Scl.Ref<'Variable'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:FunctionCategory name="INTERFACE FCAT" uuid="${FCAT_UUID}" desc="rev1 category" ${id}="fcat-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/CB Interface" functionUuid="${FN_UUID}" ${id}="fcatref-s"/>
				</eIEC61850-6-100:FunctionCategory>
				<eIEC61850-6-100:Variable name="Prefix" value="rev1val" uuid="var-src-uuid" ${id}="var-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/CB Interface/CSWI1" elementUuid="lnode-src-uuid" ${id}="vat-s"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="CB Interface" uuid="${FN_UUID}" desc="rev1 function" ${id}="fn-1">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-src-uuid" ${id}="lnode-1"/>
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

const skipAll =
	() =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(groups.map((g) => [g.id, 'skip'] as const))

// rev1 -> rev2: the template evolves the function + both satellites and adds a new LNode.
const toRev2 = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(functionRef, { attributes: { desc: 'rev2 function' } })
	await tx.update(categoryRef, { attributes: { desc: 'rev2 category' } })
	await tx.update(variableRef, { attributes: { value: 'rev2val' } })
	await tx.addChild(functionRef, {
		tagName: 'LNode',
		attributes: { iedName: 'None', lnClass: 'CILO', lnInst: '1' },
	})
}

describe('lifecycle integration — CB Interface FSD rev1 → rev2 (function + satellites + graft)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting carries every rev2 change: function, FunctionCategory, Variable, and the new LNode':
			{
				sourceXml,
				targetXml,
				mutate: toRev2,
				decide: () => new Map(),
				expectedQueries: [
					`//default:Function[@templateUuid="${FN_UUID}"][@desc="rev2 function"]`,
					`//v2019C1:FunctionCategory[@templateUuid="${FCAT_UUID}"][@desc="rev2 category"]`,
					'//v2019C1:Variable[@templateUuid="var-src-uuid"][@value="rev2val"]',
					'//default:Function[@name="CB Interface"]/default:LNode[@lnClass="CILO"]',
					// the VariableApplyTo path is rebuilt into instance space from its uuid
					'//v2019C1:VariableApplyTo[@element="S1/V1/B1/CB Interface/CSWI1"]',
				],
				unexpectedQueries: ['//v2019C1:VariableApplyTo[@element="TEMPLATE/CB Interface/CSWI1"]'],
			},

		'skipping leaves the rev1 instance untouched': {
			sourceXml,
			targetXml,
			mutate: toRev2,
			decide: skipAll(),
			expectedQueries: [
				'//default:Function[@desc="rev1 function"]',
				'//v2019C1:FunctionCategory[@desc="rev1 category"]',
				'//v2019C1:Variable[@value="rev1val"]',
			],
			unexpectedQueries: [
				'//default:Function[@desc="rev2 function"]',
				'//v2019C1:FunctionCategory[@desc="rev2 category"]',
				'//v2019C1:Variable[@value="rev2val"]',
				'//default:LNode[@lnClass="CILO"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// rev1: instantiate the FSD into the empty target project
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})

		// the template author ships rev2
		await source.transaction(testCase.mutate)

		// review + apply rev2 onto the existing instance
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

// Golden: freeze the full accept-all rev2 instance so any unintended structural
// change is caught. Deterministic uuids via the counter mock (as runSclTestCases
// does during act) keep the snapshot stable.
describe('lifecycle integration — CB Interface FSD rev1 → rev2 (golden)', () => {
	test('accept-all rev2 produces the expected instance', async () => {
		const { project, source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const realRandomUUID = crypto.randomUUID
		crypto.randomUUID = createMockRandomUUID()
		try {
			await target.document.transaction((tx) =>
				instantiateFsd(tx, {
					sourceQuery: source.document.query,
					functionRef,
					targetParent: bayRef,
				}),
			)
			await source.document.transaction(toRev2)

			const rep = await report(target.document.query, {
				verb: 'fsd',
				sourceQuery: source.document.query,
				ref: functionRef,
				anchor: bayRef,
			})
			await target.document.transaction((tx) =>
				apply(tx, {
					verb: 'fsd',
					sourceQuery: source.document.query,
					ref: functionRef,
					anchor: bayRef,
					report: rep,
					decisions: new Map(),
				}),
			)

			const xml = await target.document.query.getSnapshot({ as: 'xml' })
			expect(xml).toMatchSnapshot()
		} finally {
			crypto.randomUUID = realRandomUUID
			await project.destroy()
		}
	})
})
