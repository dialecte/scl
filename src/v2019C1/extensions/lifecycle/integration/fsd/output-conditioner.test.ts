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

// Integration test distilled from the hand-written `CB APP/Output Conditioner`
// FSD (2019C1). Real uuids kept for traceability; structure reduced to the
// lifecycle-relevant core and counter-checked against the Dialecte definition.
// Unlike the CB Interface FSD test, this one carries an OPEN `SourceRef`
// (a later-binding dataflow input, 90-30 §6.2.3): it must travel on instantiate
// and survive the reconcile WITHOUT being auto-bound. rev1→rev2 exercises a
// function reconcile, the FunctionCategory satellite, a grafted LNode, and the
// preservation of the open SourceRef.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const FN_UUID = '5938b1b5-a55c-4b17-b95b-2ff28ba89fa3' // real Output Conditioner function uuid
const FCAT_UUID = 'ffbd5191-01b2-4ef4-9c75-c2ded5902381' // real PHYSICAL RESOURCE FCAT uuid

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const categoryRef = { tagName: 'FunctionCategory', id: 'fcat-s' } as Scl.Ref<'FunctionCategory'>
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
				<eIEC61850-6-100:FunctionCategory name="PHYSICAL RESOURCE FCAT" uuid="${FCAT_UUID}" desc="rev1 category" ${id}="fcat-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/Output Conditioner" functionUuid="${FN_UUID}" ${id}="fcatref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Output Conditioner" uuid="${FN_UUID}" desc="rev1 function" ${id}="fn-1">
						<LNode iedName="none" lnClass="LCBO" lnInst="1" lnType="LCBO_Type" uuid="lnode-src-uuid" ${id}="lnode-1">
							<Private type="eIEC61850-6-100" ${id}="lnode-priv-s">
								<eIEC61850-6-100:LNodeInputs ${id}="inputs-s">
									<eIEC61850-6-100:SourceRef pDO="TrCmd" pLN="XCBR" pDA="stVal" input="Trip" service="GOOSE" uuid="srcref-src-uuid" ${id}="srcref-s"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="LCBO_Type" lnClass="LCBO" ${id}="lnt-s">
				<DO name="OutInd" type="SPS_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="SPS_Type" cdc="SPS" ${id}="dot-s">
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

// rev1 -> rev2: the template evolves the function + its category and grafts a new
// LNode. The open SourceRef is left as-is by the template author.
const toRev2 = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(functionRef, { attributes: { desc: 'rev2 function' } })
	await tx.update(categoryRef, { attributes: { desc: 'rev2 category' } })
	await tx.addChild(functionRef, {
		tagName: 'LNode',
		attributes: { iedName: 'none', lnClass: 'LPDO', lnInst: '1' },
	})
}

describe('lifecycle integration — Output Conditioner FSD rev1 → rev2 (open SourceRef + graft)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting carries rev2 and preserves the open SourceRef': {
			sourceXml,
			targetXml,
			mutate: toRev2,
			decide: () => new Map(),
			expectedQueries: [
				`//default:Function[@templateUuid="${FN_UUID}"][@desc="rev2 function"]`,
				`//v2019C1:FunctionCategory[@templateUuid="${FCAT_UUID}"][@desc="rev2 category"]`,
				'//default:Function[@name="Output Conditioner"]/default:LNode[@lnClass="LPDO"]',
				// the open dataflow input travels and stays open (unbound)
				'//v2019C1:SourceRef[@templateUuid="srcref-src-uuid"][@input="Trip"]',
			],
			unexpectedQueries: [
				'//default:Function[@desc="rev1 function"]',
				'//v2019C1:FunctionCategory[@desc="rev1 category"]',
			],
		},

		'skipping leaves the rev1 instance untouched': {
			sourceXml,
			targetXml,
			mutate: toRev2,
			decide: skipAll(),
			expectedQueries: [
				'//default:Function[@desc="rev1 function"]',
				'//v2019C1:FunctionCategory[@desc="rev1 category"]',
				'//v2019C1:SourceRef[@input="Trip"]',
			],
			unexpectedQueries: [
				'//default:Function[@desc="rev2 function"]',
				'//v2019C1:FunctionCategory[@desc="rev2 category"]',
				'//default:LNode[@lnClass="LPDO"]',
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

// Golden: freeze the full accept-all rev2 instance.
describe('lifecycle integration — Output Conditioner FSD rev1 → rev2 (golden)', () => {
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
