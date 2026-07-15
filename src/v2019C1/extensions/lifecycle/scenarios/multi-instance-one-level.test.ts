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
// Pins current anchor-disambiguation behaviour:
//  - instantiate is unconditional -> two instances coexist (same templateUuid, fresh
//    uuids, colliding names);
//  - update resolves ONE instance per (anchor, templateUuid) via findInstanceUnder, so
//    exactly one is reconciled to v2 and the other stays v1 (asserted by the absence of
//    a SECOND v1/v2 Function under the Bay).
// Disambiguating WHICH instance (or fanning out to all) is a deferred capability.

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

describe('lifecycle scenario — multi-instance same template at one level (anchor disambiguation)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two instances share a templateUuid under one Bay; a template update reconciles exactly one': {
			sourceXml,
			targetXml,
			expectedQueries: [
				'//default:Bay/default:Function[@templateUuid="fn-1"]', // shared template lineage
				'//default:Bay/default:Function[@desc="v1"]', // the untouched instance
				'//default:Bay/default:Function[@desc="v2"]', // the reconciled instance
			],
			// exactly one of each — no second v1 or v2 Function under the Bay
			unexpectedQueries: [
				'//default:Bay/default:Function[@desc="v1"][2]',
				'//default:Bay/default:Function[@desc="v2"][2]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// instantiate the same template twice under B1
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
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
