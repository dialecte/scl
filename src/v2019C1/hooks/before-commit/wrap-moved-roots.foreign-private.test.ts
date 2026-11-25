import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A variable in the SCL Private of bay B1; bay B2 holds a vendor Private (another namespace) of the 6-100 type. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay-1" name="B1">
					<Private ${id}="private-1" type="eIEC61850-6-100">
						<eIEC61850-6-100:Variable ${id}="variable" name="VX" value="1"/>
					</Private>
				</Bay>
				<Bay ${id}="bay-2" name="B2">
					<v:Private xmlns:v="urn:vendor" ${id}="vendor-private" type="eIEC61850-6-100"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('a move - a moved 6-100 root is wrapped in an SCL Private, never a vendor one', () => {
	it('a variable moved to a bay holding a vendor Private of the 6-100 type → in a new SCL Private of that bay, the vendor one left empty', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		await source.document.transaction(async function move(tx) {
			await tx.any.move(
				{ tagName: 'Variable', id: 'variable' },
				{ parent: { tagName: 'Bay', id: 'bay-2' } },
			)
		})
		const query = source.document.query as Core.Query<Config>
		const variable = await query.getRecord({
			tagName: 'Variable',
			id: 'variable',
		} as Scl.Ref<'Variable'>)
		const holder = variable?.parent
			? await query.getRecord(variable.parent as Scl.Ref<Scl.ElementsOf>)
			: undefined
		const vendorPrivate = await query.getRecord({
			tagName: 'Private',
			id: 'vendor-private',
		} as Scl.Ref<'Private'>)

		expect(holder?.namespace.uri).toBe('http://www.iec.ch/61850/2003/SCL')
		expect(holder?.parent?.id).toBe('bay-2')
		expect(vendorPrivate?.children).toEqual([])
	})
})
