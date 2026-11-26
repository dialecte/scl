import { findConstraintParent } from './resolve-placement-collision'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'
import { measureReadCost } from '@/v2019C1/test/read-cost'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A bay whose SCL Private holds a variable and a vendor's own Private, which holds an element of its own. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay" name="B1">
					<Function ${id}="function" name="Prot"/>
					<Private ${id}="private" type="eIEC61850-6-100">
						<eIEC61850-6-100:Variable ${id}="variable" name="VX" value="1"/>
						<v:Private xmlns:v="urn:vendor" ${id}="vendor-private" type="eIEC61850-6-100">
							<v:Setting ${id}="vendor-setting"/>
						</v:Private>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('findConstraintParent - the parent a key is unique under, past the SCL Private only', () => {
	it('an element in the SCL Private of a bay → the bay', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const parent = await findConstraintParent(source.document.query, {
			ref: { tagName: 'Variable', id: 'variable' } as Scl.Ref<Scl.ElementsOf>,
		})

		expect(parent).toEqual({ tagName: 'Bay', id: 'bay' })
	})

	it('an element in a vendor Private (another namespace) → that vendor Private, as core reads it', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const parent = await findConstraintParent(source.document.query, {
			ref: { tagName: 'Setting', id: 'vendor-setting' } as unknown as Scl.Ref<Scl.ElementsOf>,
		})

		expect(parent).toEqual({ tagName: 'Private', id: 'vendor-private' })
	})

	for (const [label, ref, storeCalls] of [
		['an element of the bay itself', { tagName: 'Function', id: 'function' }, 1],
		['an element in the SCL Private of the bay', { tagName: 'Variable', id: 'variable' }, 2],
		['an element in a vendor Private', { tagName: 'Setting', id: 'vendor-setting' }, 3],
	] as const) {
		it(`${label} → no more store calls than main's parent walk: ${storeCalls}`, async () => {
			const { source } = await createSclTestProject({ sourceXml, dev: { perf: true } })
			const { cost } = await measureReadCost({
				source: source.document,
				read: function findParent(query) {
					return findConstraintParent(query, { ref: ref as unknown as Scl.Ref<Scl.ElementsOf> })
				},
			})

			expect(cost.storeCalls).toBeLessThanOrEqual(storeCalls)
		})
	}
})
