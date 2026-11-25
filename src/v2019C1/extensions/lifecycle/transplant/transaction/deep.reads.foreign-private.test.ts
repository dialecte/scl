import { deep } from './deep'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'
import { STORE_CALL_TALLIES } from '@/v2019C1/test/read-cost.constants'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A bay whose SCL Private of type ACME holds one setting. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-s">
		<Substation ${id}="sub-s" name="S1">
			<VoltageLevel ${id}="vl-s" name="V1">
				<Bay ${id}="bay-s" name="B1">
					<Private ${id}="scl-private-s" type="ACME"><v:Setting xmlns:v="urn:vendor" ${id}="scl-setting-s"/></Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The bay to land on, holding an SCL Private of type ACME. */
const targetXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-t">
		<Substation ${id}="sub-t" name="S1">
			<VoltageLevel ${id}="vl-t" name="V1">
				<Bay ${id}="bay-t" name="B1">
					<Private ${id}="scl-private-t" type="ACME"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('import.deep - the Private merge reads no more than main', () => {
	it('an SCL Private merged into the target bay’s SCL Private of its type → no more store calls than main: 5', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml,
			targetXml,
			dev: { perf: true },
		})
		if (!target) throw new Error('target required')
		const perf = source.document.perf
		const prepared = await target.document.prepare(async function place(tx) {
			perf.reset()
			await deep(tx, {
				sourceQuery: source.document.query,
				ref: { tagName: 'Private', id: 'scl-private-s' } as Scl.Ref<'Private'>,
				targetParent: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>,
				withTypes: false,
			})
		})
		const report = perf.report() as Record<string, { count?: number }>
		prepared.discard()
		const storeCalls = STORE_CALL_TALLIES.reduce(function addCount(sum, tally) {
			return sum + (report[tally]?.count ?? 0)
		}, 0)

		expect(storeCalls).toBeLessThanOrEqual(5)
	})
})
