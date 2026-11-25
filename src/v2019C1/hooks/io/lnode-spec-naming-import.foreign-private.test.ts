import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** An LNode with no naming, holding a vendor Private (another namespace) whose type is the 6-100 prefix. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay" name="B1">
					<Function ${id}="function" name="Prot">
						<LNode ${id}="lnode" iedName="None" lnClass="CSWI" lnInst="1">
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-private" type="eIEC61850-6-100"/>
						</LNode>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('the import - an LNode’s naming written in an SCL Private, never a vendor one', () => {
	it('an LNode holding a vendor Private of the 6-100 type, imported → its naming in a new SCL Private, the vendor one left empty', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const query = source.document.query as Core.Query<Config>
		const [naming] = await query.getRecordsByTagName('LNodeSpecNaming')
		if (!naming) throw new Error('no naming written')
		const holder = await query.getRecord(naming.parent as Scl.Ref<Scl.ElementsOf>)
		const vendorPrivate = await query.getRecord({
			tagName: 'Private',
			id: 'vendor-private',
		} as Scl.Ref<'Private'>)

		expect(holder?.namespace.uri).toBe('http://www.iec.ch/61850/2003/SCL')
		expect(holder?.parent?.id).toBe('lnode')
		expect(vendorPrivate?.children).toEqual([])
	})
})
