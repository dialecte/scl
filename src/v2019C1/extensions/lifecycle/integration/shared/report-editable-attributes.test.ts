import { describe, expect } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// The report is self-describing: each decision group carries its primary's editable
// attributes (schema-derived), so the UI renders inputs without re-deriving them.

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

describe('lifecycle report — decision groups are tagged with editable attributes', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the Function group exposes name (rename) + desc (free), hides identity/reference': {
			sourceXml,
			targetXml,
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		await source.transaction(async (tx) => {
			await tx.update(functionRef, { attributes: { desc: 'v2' } })
		})

		const rep = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		})

		const group = rep.groups.find((candidate) => candidate.primary.tagName === 'Function')
		const editable = group?.editableAttributes ?? []
		const byAttr = new Map(editable.map((entry) => [entry.attr, entry.mode]))

		expect(byAttr.get('name')).toBe('rename')
		expect(byAttr.get('desc')).toBe('free')
		expect(byAttr.has('uuid')).toBe(false) // identity — not editable
		expect(byAttr.has('templateUuid')).toBe(false) // lineage — not editable

		// The changed editable attribute carries its delta and is surfaced first.
		const desc = editable.find((entry) => entry.attr === 'desc')
		expect(desc?.changed).toBe(true)
		expect(desc?.before).toBe('v1') // instance's current value
		expect(desc?.after).toBe('v2') // template's incoming value
		expect(editable[0]?.attr).toBe('desc') // changed-first ordering

		// An unchanged editable attribute stays present but is not flagged.
		const name = editable.find((entry) => entry.attr === 'name')
		expect(name?.changed).toBeFalsy()
		expect(name?.before).toBeUndefined()
	}

	runSclTestCases.withoutExport({ testCases, act })
})
