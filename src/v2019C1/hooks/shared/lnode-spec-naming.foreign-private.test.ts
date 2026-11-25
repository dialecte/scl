import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** An LNode holding a vendor Private (another namespace) whose type is the 6-100 prefix; the import names it. */
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

const targetXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-t">
		<Substation ${id}="sub-t" name="S1">
			<VoltageLevel ${id}="vl-t" name="V1">
				<Bay ${id}="bay-t" name="B1"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('the commit - an LNode’s naming written in an SCL Private, never a vendor one', () => {
	it('an LNode holding a vendor Private of the 6-100 type copied without its naming → the commit names it in an SCL Private', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		await target.document.transaction(async function copyFunction(tx) {
			await tx.lifecycle.transplant.deep({
				sourceQuery: source.document.query,
				ref: { tagName: 'Function', id: 'function' } as Scl.Ref<'Function'>,
				targetParent: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>,
				withTypes: false,
				omit: ['LNodeSpecNaming'],
			})
		})
		const query = target.document.query as Core.Query<Config>
		const namings = await query.getRecordsByTagName('LNodeSpecNaming')
		const holder = namings[0]
			? await query.getRecord(namings[0].parent as Scl.Ref<Scl.ElementsOf>)
			: undefined

		expect(namings).toHaveLength(1)
		expect(holder?.namespace.uri).toBe('http://www.iec.ch/61850/2003/SCL')
	})
})
