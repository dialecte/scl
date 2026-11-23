import { importTypes } from './import-types'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test/hydrated-test'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const ns = ALL_XMLNS_NAMESPACES
const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** One LNode whose type closure is one LNodeType. */
const SOURCE_XML = /* xml */ `
	<SCL ${ns} ${id}="scl-1">
		<Substation name="S1">
			<VoltageLevel name="V1">
				<Bay name="B1">
					<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1"/>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates>
			<LNodeType id="CSWI_Type" lnClass="CSWI"><DO name="Pos" type="DPC_Type"/></LNodeType>
			<DOType id="DPC_Type" cdc="DPC"><DA name="stVal" bType="BOOLEAN" fc="ST"/></DOType>
		</DataTypeTemplates>
	</SCL>
`

const EMPTY_TARGET = `<SCL ${ns} ${id}="scl-t"><Header id="target"/></SCL>`

/** The source query, its type trees failing to read: importTypes throws inside its own progress plan. */
function failingTrees(query: Core.Query<Config>): Core.Query<Config> {
	return new Proxy(query, {
		get(target, property, receiver) {
			if (property === 'getTree')
				return function failingGetTree(): never {
					throw new Error('the source cannot be read')
				}
			const value = Reflect.get(target, property, receiver)
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
}

describe('importTypes - progress after a throw the caller catches', () => {
	it('throws inside its plan, the caller catches → the caller’s next step lands on its own plan', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: SOURCE_XML,
			targetXml: EMPTY_TARGET,
		})
		if (!target) throw new Error('target required')
		const steps: { label?: string; inner?: number }[] = []
		target.document.subscribe(function recordProgress() {
			const progress = target.document.state.progress
			if (progress) steps.push({ label: progress.label, inner: progress.step?.total })
		})

		const [lnode] = await source.document.query.getRecordsByTagName('LNode')
		await target.document.transaction(async (tx) => {
			tx.progress.plan({ steps: 2, label: 'Caller' })
			await importTypes(tx, {
				sourceQuery: failingTrees(source.document.query),
				records: [lnode],
			}).catch(() => undefined)
			tx.progress.nextStep('Caller after the import')
		})

		expect(steps.at(-1)).toEqual({ label: 'Caller after the import', inner: undefined })
	})
})
