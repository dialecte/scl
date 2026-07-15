import { apply } from '../apply'
import { report } from '../report'

import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// Engine-hardening scenario (hand-authored, schema-checked). One template Function is
// instantiated TWICE under the same Bay, so the target holds two instances that share
// a templateUuid at one anchor level. A later template update is reported/applied
// against that anchor.
//
// Pins current behaviour:
//  - instantiate is unconditional, but a NAME COLLISION is auto-resolved: the second
//    instance is renamed Prot -> Prot_1 (schema constraint uniqueChildNameInBay), so
//    the two instances coexist with DISTINCT names (same templateUuid, fresh uuids);
//  - a template update still resolves ONE instance per (anchor, templateUuid) via
//    findInstanceUnder, so exactly one is reconciled to v2 and the other stays v1.
// Disambiguating WHICH instance (or fanning out to all) is a deferred capability (Part C).

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

describe('lifecycle scenario — multi-instance same template at one level (collision + anchor)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a repeated instantiate auto-resolves the name collision; a template update reconciles exactly one':
			{
				sourceXml,
				targetXml,
				expectedQueries: [
					'//default:Bay/default:Function[@templateUuid="fn-1"]', // shared template lineage
					'//default:Bay/default:Function[@name="Prot"]', // first instance keeps the name
					'//default:Bay/default:Function[@name="Prot_1"]', // collision auto-resolved
					'//default:Bay/default:Function[@desc="v1"]', // the untouched instance
					'//default:Bay/default:Function[@desc="v2"]', // the reconciled instance
				],
				unexpectedQueries: [
					// names are distinct (no second Prot) and exactly one of each desc
					'//default:Bay/default:Function[@name="Prot"][2]',
					'//default:Bay/default:Function[@desc="v1"][2]',
					'//default:Bay/default:Function[@desc="v2"][2]',
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// instantiate the same template twice under B1 (two separate operations)
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})

		// the template evolves
		await source.transaction(async (tx) => {
			await tx.update(functionRef, { attributes: { desc: 'v2' } })
		})

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
				decisions: new Map(),
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
