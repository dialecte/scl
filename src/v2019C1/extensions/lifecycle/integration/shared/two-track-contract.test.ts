import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	preInstantiate: boolean
	mutate?: (tx: Scl.Transaction) => Promise<void>
	expectedNeedsDecisions: boolean
}

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
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

describe('lifecycle two-track surface (report + apply)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fast (first-time): no decisions -> apply instantiates headless': {
			sourceXml,
			targetXml,
			preInstantiate: false,
			expectedNeedsDecisions: false,
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
			],
		},

		'fast (existing instance, no change): no decisions -> apply reconciles (idempotent, no duplicate)':
			{
				sourceXml,
				targetXml,
				preInstantiate: true,
				expectedNeedsDecisions: false,
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
				],
				unexpectedQueries: [
					// no second copy added by the reconcile
					'//default:Bay[@name="B1"]/default:Function[@name="Prot"][2]',
				],
			},

		'full (existing instance + change): needs decisions -> apply is a no-op (nothing written)': {
			sourceXml,
			targetXml,
			preInstantiate: true,
			mutate: async (tx) => {
				await tx.update(functionRef, { attributes: { desc: 'v2' } })
			},
			expectedNeedsDecisions: true,
			expectedQueries: [
				// the v1 instance is untouched
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
			],
			unexpectedQueries: [
				// the template change was NOT applied (full track waits for decisions)
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@desc="v2"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		if (testCase.preInstantiate) {
			await target.transaction(async (tx) => {
				await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
			})
		}
		if (testCase.mutate) {
			await source.transaction(testCase.mutate)
		}

		const rep = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		})
		expect(rep.needsDecisions).toBe(testCase.expectedNeedsDecisions)

		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
