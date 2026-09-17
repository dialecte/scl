import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// Placement-conflict classification for the TOPOLOGY FRAME root on an SSD instantiate report:
// a second instantiate of one bay-typical under a VoltageLevel that already holds an instance
// must surface the frame-root name bump (B1 -> B1_1) in the report preview, so apply and preview
// agree. Mirrors report-placement-conflict.test.ts for the fn/app layers.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const bayScope = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
const targetVl = { tagName: 'VoltageLevel', id: 'vl-t' } as Scl.Ref<'VoltageLevel'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-doc-uuid" version="0" revision="1" ${id}="hdr-s"/>
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="B1" ${id}="bay-s">
					<ConductingEquipment name="QA1" type="CBR" ${id}="ce-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t"/>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// Skipped: the instantiate frame-root preview group is intentionally not emitted (the consumer's
// diff renderer can't render an added topology group — see report-topology-frame.ts). The apply-time
// bump still runs. Un-skip when the preview group is re-enabled.
describe.skip('lifecycle report — SSD frame-root placement conflict', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a second instantiate of one bay-typical flags the frame-root name collision with B1_1': {
			sourceXml,
			targetXml,
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		// seed one existing bay so a re-instantiation collides on the Bay name
		await target.transaction(async (tx) => {
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: bayScope,
				targetParent: targetVl,
			})
		})

		const rep = await report(target.query, {
			verb: 'ssd',
			scenario: 'instantiate',
			sourceQuery: source.query,
			ref: bayScope,
			anchor: targetVl,
		})

		const frameGroup = allGroups(rep).find((group) => group.primary.tagName === 'Bay')
		const nameAttr = frameGroup?.editableAttributes?.find((entry) => entry.attr === 'name')

		expect(frameGroup).toBeDefined()
		expect(nameAttr?.conflict).toBe(true)
		expect(nameAttr?.suggestedValue).toBe('B1_1')
		expect(frameGroup?.conflict).toBeUndefined() // resolvable (name editable), not identity-locked
	}

	runSclTestCases.withoutExport({ testCases, act })
})
