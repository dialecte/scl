import { importTypes } from './import-types'

import { describe, expect, it } from 'vitest'

import { createSclTestProject } from '@/v2019C1/test/hydrated-test'

// One LNode whose type closure is exactly three types (bottom-up: EnumType,
// DOType, LNodeType) so the source-loop step total is deterministic.
const SOURCE_XML = /* xml */ `
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" __id="scl-1">
	<Substation name="S1" __id="sub-1">
		<VoltageLevel name="V1" __id="vl-1">
			<Bay name="B1" __id="bay-1">
				<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" __id="lnode-1"/>
			</Bay>
		</VoltageLevel>
	</Substation>
	<DataTypeTemplates __id="dtt-1">
		<LNodeType id="CSWI_Type" lnClass="CSWI" __id="lnt-1">
			<DO name="Pos" type="DPC_Type" __id="do-1"/>
		</LNodeType>
		<DOType id="DPC_Type" cdc="DPC" __id="dot-1">
			<DA name="stVal" bType="Enum" type="BehaviourModeKind" fc="ST" __id="da-1"/>
		</DOType>
		<EnumType id="BehaviourModeKind" __id="et-1">
			<EnumVal ord="1" __id="ev-1">on</EnumVal>
		</EnumType>
	</DataTypeTemplates>
</SCL>`

const EMPTY_TARGET = `<SCL xmlns="http://www.iec.ch/61850/2003/SCL" __id="scl-t"></SCL>`

describe('importTypes — progress instrumentation', () => {
	it('reports a fine step over the source-type loop and captions each type', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: SOURCE_XML,
			targetXml: EMPTY_TARGET,
		})
		if (!target) throw new Error('target required')

		const stepTotals: number[] = []
		const labels: string[] = []
		target.document.subscribe(() => {
			const progress = target.document.state.progress
			if (progress?.step) stepTotals.push(progress.step.total)
			if (progress?.label) labels.push(progress.label)
		})

		const [lnode] = await source.document.query.getRecordsByTagName('LNode')
		await target.document.transaction(async (tx) => {
			// Open a master plan so importTypes' own plan surfaces as `step` (as it does
			// under a real extension's applyPlan); called bare it would be the master.
			tx.progress.plan({ steps: 1, label: 'Importing types' })
			await importTypes(tx, { sourceQuery: source.document.query, records: [lnode] })
		})

		// The plan is sized to the source loop: 3 top-level types (EnumType, DOType,
		// LNodeType) → total 3. The remap/reclaim tail captions clamp at 100%.
		expect(stepTotals).toContain(3)
		// Each type is captioned by its id as the loop advances.
		expect(labels.some((l) => l.includes('BehaviourModeKind'))).toBe(true)

		await project.destroy()
	})
})
