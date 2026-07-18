import { createMockRandomUUID } from '@dialecte/core/test'
import { describe, expect, test } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// Integration test distilled from the hand-written `CB APP/CB rev1 → rev2.asd`
// pair (2019C1). The real uuids are kept for traceability; the structure is reduced
// to the lifecycle-relevant application-layer core and counter-checked against the
// Dialecte definition:
//  - FunctionCategory lives under Substation (valid parent) — normalized from the
//    rev1 Bay-level placement (the real files move it up between revs);
//  - AllocationRole is a Bay-level satellite the Application references outward via
//    AllocationRoleRef; Application composes the Function via FunctionRef.
// rev1→rev2 exercises, through the two-track report/apply surface: the Application
// reconcile, the AllocationRole satellite reconcile, the FunctionCategory satellite
// reconcile, and the composed-function cascade (the referenced Function updated as
// an FSD one layer down).

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const APP_UUID = 'CB_APP' // real CB application uuid
const P1_AR = 'P1_AR' // real P1 allocation-role uuid
const FN_UUID = 'd996cde9-fc40-4510-8b08-d685da2be6e4' // real CB Function uuid
const FCAT_UUID = 'b159f5e3-d97c-430d-8664-95b5cfed7c43' // real INTERFACE FCAT uuid

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const allocationRoleRef = { tagName: 'AllocationRole', id: 'ar-p1-s' } as Scl.Ref<'AllocationRole'>
const composedFunctionRef = { tagName: 'Function', id: 'fn-s' } as Scl.Ref<'Function'>
const categoryRef = { tagName: 'FunctionCategory', id: 'fcat-s' } as Scl.Ref<'FunctionCategory'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:FunctionCategory name="INTERFACE FCAT" uuid="${FCAT_UUID}" desc="rev1 category" ${id}="fcat-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/CB Interface" functionUuid="${FN_UUID}" ${id}="fcatref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-priv-s">
						<eIEC61850-6-100:AllocationRole name="P1" uuid="${P1_AR}" desc="rev1 role" ${id}="ar-p1-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/CB Interface" functionUuid="${FN_UUID}" ${id}="ar-fnref-s"/>
						</eIEC61850-6-100:AllocationRole>
						<eIEC61850-6-100:Application desc="rev1 app" name="CB" uuid="${APP_UUID}" ${id}="app-s">
							<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/P1" allocationRoleUuid="${P1_AR}" ${id}="ar-ref-s"/>
							<eIEC61850-6-100:FunctionRole name="INTERFACE" uuid="fr-src-uuid" ${id}="fr-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/CB Interface" functionUuid="${FN_UUID}" ${id}="app-fnref-s"/>
									<eIEC61850-6-100:FunctionCategoryRef functionCategory="TEMPLATE/INTERFACE FCAT" functionCategoryUuid="${FCAT_UUID}" ${id}="fcatref2-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="CB Interface" uuid="${FN_UUID}" desc="rev1 function" ${id}="fn-s">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-src-uuid" ${id}="lnode-s"/>
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

// Skip ONLY the composed-function decision group (primary is the Function), leaving
// the application-layer group accepted. Exercises cascade gating across layers.
const skipComposedFunction =
	() =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(
			groups.filter((g) => g.primary.tagName === 'Function').map((g) => [g.id, 'skip'] as const),
		)

// rev1 -> rev2: the template evolves the application, its AllocationRole satellite,
// the FunctionCategory satellite, and the composed Function.
const toRev2 = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(applicationRef, { attributes: { desc: 'rev2 app' } })
	await tx.update(allocationRoleRef, { attributes: { desc: 'rev2 role' } })
	await tx.update(categoryRef, { attributes: { desc: 'rev2 category' } })
	await tx.update(composedFunctionRef, { attributes: { desc: 'rev2 function' } })
}

describe('lifecycle integration — CB ASD rev1 → rev2 (application + satellites + cascade)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting carries every rev2 change: Application, AllocationRole, FunctionCategory, and the composed Function':
			{
				sourceXml,
				targetXml,
				mutate: toRev2,
				decide: () => new Map(),
				expectedQueries: [
					`//v2019C1:Application[@templateUuid="${APP_UUID}"][@desc="rev2 app"]`,
					`//v2019C1:AllocationRole[@templateUuid="${P1_AR}"][@desc="rev2 role"]`,
					`//v2019C1:FunctionCategory[@templateUuid="${FCAT_UUID}"][@desc="rev2 category"]`,
					`//default:Function[@templateUuid="${FN_UUID}"][@desc="rev2 function"]`,
				],
				unexpectedQueries: [
					'//v2019C1:Application[@desc="rev1 app"]',
					'//v2019C1:AllocationRole[@desc="rev1 role"]',
					'//v2019C1:FunctionCategory[@desc="rev1 category"]',
					'//default:Function[@desc="rev1 function"]',
				],
			},

		'skipping leaves the rev1 instance untouched': {
			sourceXml,
			targetXml,
			mutate: toRev2,
			decide: skipAll(),
			expectedQueries: [
				'//v2019C1:Application[@desc="rev1 app"]',
				'//v2019C1:AllocationRole[@desc="rev1 role"]',
				'//v2019C1:FunctionCategory[@desc="rev1 category"]',
				'//default:Function[@desc="rev1 function"]',
			],
			unexpectedQueries: [
				'//v2019C1:Application[@desc="rev2 app"]',
				'//v2019C1:AllocationRole[@desc="rev2 role"]',
				'//v2019C1:FunctionCategory[@desc="rev2 category"]',
				'//default:Function[@desc="rev2 function"]',
			],
		},

		'skipping only the composed-function group keeps it at rev1 while the application layer takes rev2':
			{
				sourceXml,
				targetXml,
				mutate: toRev2,
				decide: skipComposedFunction(),
				expectedQueries: [
					'//v2019C1:Application[@desc="rev2 app"]',
					'//v2019C1:AllocationRole[@desc="rev2 role"]',
					'//default:Function[@desc="rev1 function"]',
					'//v2019C1:FunctionCategory[@desc="rev1 category"]',
				],
				unexpectedQueries: [
					'//default:Function[@desc="rev2 function"]',
					'//v2019C1:FunctionCategory[@desc="rev2 category"]',
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// rev1: instantiate the ASD into the empty target project
		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})

		// the template author ships rev2
		await source.transaction(testCase.mutate)

		// review + apply rev2 onto the existing instance
		const rep = await report(target.query, {
			verb: 'asd',
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		})
		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'asd',
				sourceQuery: source.query,
				ref: applicationRef,
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
describe('lifecycle integration — CB ASD rev1 → rev2 (golden)', () => {
	test('accept-all rev2 produces the expected instance', async () => {
		const { project, source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const realRandomUUID = crypto.randomUUID
		crypto.randomUUID = createMockRandomUUID()
		try {
			await target.document.transaction((tx) =>
				instantiateAsd(tx, {
					sourceQuery: source.document.query,
					applicationRef,
					targetParent: bayRef,
				}),
			)
			await source.document.transaction(toRev2)

			const rep = await report(target.document.query, {
				verb: 'asd',
				sourceQuery: source.document.query,
				ref: applicationRef,
				anchor: bayRef,
			})
			await target.document.transaction((tx) =>
				apply(tx, {
					verb: 'asd',
					sourceQuery: source.document.query,
					ref: applicationRef,
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
