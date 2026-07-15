import { apply } from '../apply'
import { report } from '../report'

import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { GroupDecision } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
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

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mode: 'accept-all' | 'accept-prot-only' | 'skip-all'
}

describe('lifecycle scenario — multi-instance same template at one level (collision + anchor)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accept-all reconciles EVERY instance to v2': {
			sourceXml,
			targetXml,
			mode: 'accept-all',
			expectedQueries: [
				'//default:Bay/default:Function[@name="Prot"][@desc="v2"]', // first instance updated
				'//default:Bay/default:Function[@name="Prot_1"][@desc="v2"]', // second instance updated too
			],
			unexpectedQueries: [
				'//default:Bay/default:Function[@desc="v1"]', // no instance left at v1
			],
		},
		'accepting only one instance updates just that one (targeted subset)': {
			sourceXml,
			targetXml,
			mode: 'accept-prot-only',
			expectedQueries: [
				'//default:Bay/default:Function[@name="Prot"][@desc="v2"]', // selected instance updated
				'//default:Bay/default:Function[@name="Prot_1"][@desc="v1"]', // unselected instance untouched
			],
			unexpectedQueries: [
				'//default:Bay/default:Function[@name="Prot"][@desc="v1"]',
				'//default:Bay/default:Function[@name="Prot_1"][@desc="v2"]',
			],
		},
		'skip-all leaves every instance at v1': {
			sourceXml,
			targetXml,
			mode: 'skip-all',
			expectedQueries: [
				'//default:Bay/default:Function[@name="Prot"][@desc="v1"]',
				'//default:Bay/default:Function[@name="Prot_1"][@desc="v1"]',
			],
			unexpectedQueries: [
				'//default:Bay/default:Function[@desc="v2"]', // nothing updated
			],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// instantiate the same template twice under B1 (two separate operations) — the
		// second is auto-renamed Prot -> Prot_1 by collision resolution (S3)
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

		// the report now carries ONE decision-group set per instance; the decision map
		// is the selector — accept the subset of instances to update
		const decisions = new Map<string, GroupDecision>()
		if (testCase.mode === 'skip-all') {
			for (const group of rep.groups) decisions.set(group.id, 'skip')
		} else if (testCase.mode === 'accept-prot-only') {
			const [prot1] = await target.query.findByAttributes({
				tagName: 'Function',
				attributes: { name: 'Prot_1' },
			})
			for (const group of rep.groups) {
				if (group.instanceScopeId === prot1?.id) decisions.set(group.id, 'skip')
			}
		}
		// accept-all -> empty map (absent groups default to accept)

		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
				decisions,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
