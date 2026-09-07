import { importTypes } from './import-types'

import { describe, expect, it } from 'vitest'

import { createSclTestProject } from '@/v2019C1/test/hydrated-test'

// One LNode whose type closure is exactly three types (bottom-up: EnumType,
// DOType, LNodeType).
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

describe('importTypes — perf instrumentation', () => {
	it('records a scl::importTypes perf span (with a sourceLoop sub-span) when dev.perf is on', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: SOURCE_XML,
			targetXml: EMPTY_TARGET,
			dev: { perf: true },
		})
		if (!target) throw new Error('target required')

		const [lnode] = await source.document.query.getRecordsByTagName('LNode')
		await target.document.transaction(async (tx) => {
			await importTypes(tx, { sourceQuery: source.document.query, records: [lnode] })
		})

		const report = target.document.perf.report()
		expect(report['scl::importTypes']?.calls).toBeGreaterThanOrEqual(1)
		expect(report['scl::importTypes::sourceLoop']?.calls).toBeGreaterThanOrEqual(1)

		await project.destroy()
	})

	it('writes nothing to the perf timeline when dev.perf is off', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: SOURCE_XML,
			targetXml: EMPTY_TARGET,
		})
		if (!target) throw new Error('target required')

		const [lnode] = await source.document.query.getRecordsByTagName('LNode')
		await target.document.transaction(async (tx) => {
			await importTypes(tx, { sourceQuery: source.document.query, records: [lnode] })
		})

		expect(target.document.perf.report()).toEqual({})

		await project.destroy()
	})
})
