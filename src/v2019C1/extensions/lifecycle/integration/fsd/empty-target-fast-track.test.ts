import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// Engine-hardening scenario (hand-authored, schema-checked). First-time application
// into a target that holds the topology skeleton but no instance of the template:
// the surface reports a fast track (needsDecisions === false — the one non-XML,
// report-level assertion), and a headless apply (no decisions) instantiates the
// function with stamped instance lineage + imported type closure.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="sub">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="fn-1" desc="v1" ${id}="fn-1">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="ln-1" ${id}="ln-1"/>
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

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

describe('lifecycle scenario — empty target / uninstantiated template (fast track)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'report classifies a first-time application as fast, and headless apply instantiates it': {
			sourceXml,
			targetXml,
			expectedQueries: [
				'//default:Function[@name="Prot"][@desc="v1"]',
				'//default:Function[@templateUuid="fn-1"]', // stamped instance lineage
				'//default:LNode[@lnClass="CSWI"]',
				'//default:DataTypeTemplates/default:LNodeType[@lnClass="CSWI"]', // type closure imported
			],
			// the instance carries a FRESH uuid, not the template's
			unexpectedQueries: ['//default:Function[@uuid="fn-1"]'],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// no instance yet -> the surface must classify this as the fast track. This is the
		// one report-level (non-XML) assertion the scenario needs.
		const rep = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		})
		expect(rep.needsDecisions).toBe(false)

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
