import { findNativeLnByUuid } from './find-native-ln-by-uuid'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** An IED's logical device holding a logical node of its own, and one inside a vendor Private (another namespace). */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<IED ${id}="ied" name="IED1">
			<AccessPoint ${id}="ap" name="AP1">
				<Server ${id}="server">
					<Authentication ${id}="auth"/>
					<LDevice ${id}="ld" inst="LD1">
						<LN0 ${id}="ln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-uuid"/>
						<v:Private xmlns:v="urn:vendor" ${id}="vendor-private">
							<LN ${id}="vendor-ln" lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="vendor-ln-uuid"/>
						</v:Private>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt">
			<LNodeType ${id}="lnt0" id="LLN0_T" lnClass="LLN0"><DO ${id}="do0" name="Beh" type="ENS_T"/></LNodeType>
			<LNodeType ${id}="lnt1" id="XCBR_T" lnClass="XCBR"><DO ${id}="do1" name="Beh" type="ENS_T"/></LNodeType>
			<DOType ${id}="dot" id="ENS_T" cdc="ENS"><DA ${id}="da" name="stVal" bType="Enum" type="Beh_E" fc="ST"/></DOType>
			<EnumType ${id}="et" id="Beh_E"><EnumVal ${id}="ev" ord="1">on</EnumVal></EnumType>
		</DataTypeTemplates>
	</SCL>
`

describe('findNativeLnByUuid - a logical node is native only where the SCL nests it', () => {
	it('the logical node of a logical device → found, with its IED', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const found = await findNativeLnByUuid(source.document.query, { uuid: 'ln0-uuid' })

		expect(found?.ln.id).toBe('ln0')
		expect(found?.ied).toEqual({ tagName: 'IED', id: 'ied' })
	})

	it('a logical node inside a vendor Private (another namespace) → not native, as core reads its chain', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const found = await findNativeLnByUuid(source.document.query, { uuid: 'vendor-ln-uuid' })

		expect(found).toBeUndefined()
	})
})
