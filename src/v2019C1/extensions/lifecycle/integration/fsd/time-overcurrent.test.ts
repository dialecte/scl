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

// Integration test distilled from the hand-written `FSD/Time Overcurrent` FSD
// (2019C1). Real uuids kept for traceability; structure reduced to the
// lifecycle-relevant core and counter-checked against the Dialecte definition.
// This one exercises satellite DELETION: rev2 retires the FunctionCategory
// ELEMENT from the template (catalog retirement, not a mere un-reference), so on
// accept the instance's FunctionCategory is deleted; on skip it stays. The
// deletion rides the function's decision group (its desc is bumped to form it).

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const FN_UUID = '1b67e1e0-e9a6-4e59-bb11-70188134d9a6' // real Time Overcurrent function uuid
const FCAT_UUID = 'a88fe312-94d5-4e57-9437-37a808cc75ac' // real Protection FCAT uuid

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
				<eIEC61850-6-100:FunctionCategory name="Protection" uuid="${FCAT_UUID}" desc="rev1 category" ${id}="fcat-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/Time Overcurrent" functionUuid="${FN_UUID}" ${id}="fcatref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Time Overcurrent" uuid="${FN_UUID}" desc="rev1 function" ${id}="fn-1">
						<LNode iedName="None" lnClass="PTOC" lnInst="1" lnType="PTOC_Type" uuid="lnode-src-uuid" ${id}="lnode-1"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="PTOC_Type" lnClass="PTOC" ${id}="lnt-s">
				<DO name="Op" type="ACT_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="ACT_Type" cdc="ACT" ${id}="dot-s">
				<DA name="general" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
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

// rev1 -> rev2: the function is updated (bumps its decision group) and the
// FunctionCategory element is retired from the template. The deletion rides the
// function group: accepted together, or neither.
const toRev2 = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(functionRef, { attributes: { desc: 'rev2 function' } })
	await tx.delete(categoryRef)
}

describe('lifecycle integration — Time Overcurrent FSD rev1 → rev2 (satellite deletion)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting updates the function and deletes the retired FunctionCategory': {
			sourceXml,
			targetXml,
			mutate: toRev2,
			decide: () => new Map(),
			expectedQueries: [`//default:Function[@templateUuid="${FN_UUID}"][@desc="rev2 function"]`],
			unexpectedQueries: [
				'//default:Function[@desc="rev1 function"]',
				`//v2019C1:FunctionCategory[@templateUuid="${FCAT_UUID}"]`,
			],
		},

		'skipping keeps both the rev1 function and its FunctionCategory': {
			sourceXml,
			targetXml,
			mutate: toRev2,
			decide: skipAll(),
			expectedQueries: [
				'//default:Function[@desc="rev1 function"]',
				`//v2019C1:FunctionCategory[@templateUuid="${FCAT_UUID}"]`,
			],
			unexpectedQueries: ['//default:Function[@desc="rev2 function"]'],
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

// Golden: freeze the full accept-all rev2 instance (function updated, category deleted).
describe('lifecycle integration — Time Overcurrent FSD rev1 → rev2 (golden)', () => {
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
