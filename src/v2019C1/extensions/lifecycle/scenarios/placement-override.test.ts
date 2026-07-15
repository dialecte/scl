import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide'
import type { SclTest } from '@/v2019C1/test'

// Slice 3 — the full track lets the user override an editable attribute at placement.
// The engine still owns uniqueness: a user-supplied name is used as-is when free, but
// re-resolved (bumped) when it ITSELF collides with a sibling.

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
	overrideName: string
}

describe('lifecycle scenario — user override at placement (Slice 3)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a free user name is used as-is': {
			sourceXml,
			targetXml,
			overrideName: 'Relay',
			expectedQueries: [
				'//default:Bay/default:Function[@name="Prot"]', // first instance keeps the template name
				'//default:Bay/default:Function[@name="Relay"]', // user override applied verbatim
			],
			unexpectedQueries: [
				'//default:Bay/default:Function[@name="Prot"][2]', // no duplicate
				'//default:Bay/default:Function[@name="Prot_1"]', // not auto-resolved: user name wins
			],
		},
		'a user name that itself collides is re-resolved': {
			sourceXml,
			targetXml,
			overrideName: 'Prot',
			expectedQueries: [
				'//default:Bay/default:Function[@name="Prot"]', // first instance
				'//default:Bay/default:Function[@name="Prot_1"]', // user name collided -> bumped
			],
			unexpectedQueries: [
				'//default:Bay/default:Function[@name="Prot"][2]', // uniqueness preserved
			],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// first instance takes the template name unchanged
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})

		// second instance carries the user's edited name (as the full track would supply it)
		const overrides: CollisionOverrides = new Map([
			[functionRef.id, { name: testCase.overrideName }],
		])
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, {
				sourceQuery: source.query,
				functionRef,
				targetParent: bayRef,
				overrides,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
