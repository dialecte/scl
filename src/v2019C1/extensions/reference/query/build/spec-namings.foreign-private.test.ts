import { readSpecNamingsById } from './spec-namings'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** Two LNodes: one whose SCL Private holds its naming, one whose naming sits in a vendor Private (another namespace). */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay" name="B1">
					<Function ${id}="function" name="Prot">
						<LNode ${id}="lnode" iedName="None" lnClass="CSWI" lnInst="1">
							<Private ${id}="private" type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming ${id}="naming" sLnClass="CSWI" sLnInst="1"/>
							</Private>
						</LNode>
						<LNode ${id}="vendor-lnode" iedName="None" lnClass="XCBR" lnInst="1">
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-private" type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming ${id}="vendor-naming" sLnClass="XCBR" sLnInst="1"/>
							</v:Private>
						</LNode>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('readSpecNamingsById - the naming of an LNode in its SCL Private only', () => {
	it('an LNode whose SCL Private holds its naming → that naming', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const query = source.document.query as Core.Query<Config>
		const lnode = await query.getRecord({ tagName: 'LNode', id: 'lnode' } as Scl.Ref<'LNode'>)
		if (!lnode) throw new Error('no LNode')
		const namings = await readSpecNamingsById(query, { records: [lnode] })

		expect(namings.get('lnode')?.id).toBe('naming')
	})

	it('an LNode whose naming sits in a vendor Private (another namespace) → none, as core reads the LNode', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const query = source.document.query as Core.Query<Config>
		const lnode = await query.getRecord({
			tagName: 'LNode',
			id: 'vendor-lnode',
		} as Scl.Ref<'LNode'>)
		if (!lnode) throw new Error('no LNode')
		const namings = await readSpecNamingsById(query, { records: [lnode] })

		expect(namings.has('vendor-lnode')).toBe(false)
	})
})
