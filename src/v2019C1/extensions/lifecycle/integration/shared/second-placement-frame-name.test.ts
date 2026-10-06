import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// The name of the topology frame root placed a second time (a bay typical under a voltage level
// that already holds an instance): apply writes the next free one (B1 -> B1_1), read at the element
// the report's node leads to. Mirrors second-placement-name.test.ts for the fn/app layers.

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

describe('lifecycle — the name of a bay typical placed a second time', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'placed again beside the first → the next free name, read where the report leads': {
			sourceXml,
			targetXml,
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		// one bay is already placed
		await target.transaction(async (tx) => {
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: bayScope,
				targetParent: targetVl,
			})
		})

		const lifecycleTarget = {
			verb: 'ssd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: bayScope,
			anchor: targetVl,
		}
		const lifecycleReport = await report(target.query, lifecycleTarget)
		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: lifecycleReport,
				resolution: { decisions: new Map() },
			})
		})

		const node = allGroups(lifecycleReport).find(
			(group) => group.primary.tagName === 'Bay',
		)?.primary
		const appliedName = node?.appliedRef
			? await target.query.getAttribute(node.appliedRef as Scl.Ref<'Bay'>, { name: 'name' })
			: undefined
		expect(appliedName, 'apply').toBe('B1_1')
	}

	runSclTestCases.withoutExport({ testCases, act })
})
