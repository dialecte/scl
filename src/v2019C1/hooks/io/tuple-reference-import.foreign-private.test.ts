import { describe, expect, it } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/**
 * Two LNodes naming by uuid a logical node held as vendor payload: one in an SCL Private, one in a vendor Private
 * (another namespace); their names name nothing.
 */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay" name="B1">
					<Function ${id}="function" name="Prot">
						<LNode ${id}="lnode-scl" iedName="None" lnClass="XCBR" lnInst="8" lnUuid="scl-copy-uuid"/>
						<LNode ${id}="lnode-vendor" iedName="None" lnClass="XCBR" lnInst="9" lnUuid="vendor-copy-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<IED ${id}="ied" name="IED1">
			<AccessPoint ${id}="ap" name="AP1">
				<Server ${id}="server">
					<Authentication ${id}="auth"/>
					<LDevice ${id}="ld" inst="LD1">
						<LN0 ${id}="ln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-uuid"/>
						<Private ${id}="private" type="ACME">
							<LN ${id}="scl-copy" lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="scl-copy-uuid"/>
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-private">
								<LN ${id}="vendor-copy" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="vendor-copy-uuid"/>
							</v:Private>
						</Private>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

describe('the import - an LNode never follows a logical node in vendor payload, under any Private', () => {
	it('LNodes naming by uuid a copy in an SCL Private and one in a vendor Private → both left as read', async () => {
		const { source } = await createSclTestProject({
			sourceXml,
			allowIncoherentReferences: 'the LNodes name vendor payload by uuid, the case read',
		})
		const query = source.document.query as Core.Query<Config>
		const sclLNode = await query.getRecord({
			tagName: 'LNode',
			id: 'lnode-scl',
		} as Scl.Ref<'LNode'>)
		const vendorLNode = await query.getRecord({
			tagName: 'LNode',
			id: 'lnode-vendor',
		} as Scl.Ref<'LNode'>)

		expect(readAttribute({ record: sclLNode as never, name: 'lnInst', defaults: 'none' })).toBe('8')
		expect(readAttribute({ record: vendorLNode as never, name: 'lnInst', defaults: 'none' })).toBe(
			'9',
		)
	})
})
