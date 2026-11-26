import { boundLogicalNodeOf } from './specification-ied'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** The document's IED: a logical node of its own, and one inside a vendor Private (another namespace) of its device. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<IED ${id}="ied" name="IED1">
			<AccessPoint ${id}="ap" name="AP1">
				<Server ${id}="server">
					<Authentication ${id}="auth"/>
					<LDevice ${id}="ld" inst="LD1">
						<LN0 ${id}="ln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-uuid"/>
						<Private ${id}="private" type="ACME">
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-private">
								<LN0 ${id}="vendor-ln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="vendor-ln0-uuid"/>
							</v:Private>
						</Private>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

/** Whether the logical node of that id is native, its ancestry read as an import pass holds it (every stored level). */
async function nativeOf(params: { query: Core.Query<Config>; id: string }): Promise<boolean> {
	const record = await params.query.getRecord({ tagName: 'LN0', id: params.id } as Scl.Ref<'LN0'>)
	if (!record) throw new Error(`no LN0 ${params.id}`)
	const ancestry = await params.query.findAncestors(record, { unwrap: [], order: 'top-down' })
	return boundLogicalNodeOf({ record, ancestry }).native
}

describe('boundLogicalNodeOf - native only where the SCL nests it, a vendor Private kept in the chain', () => {
	it('the logical node of the document’s own IED → native', async () => {
		const { source } = await createSclTestProject({ sourceXml })

		const native = await nativeOf({ query: source.document.query as Core.Query<Config>, id: 'ln0' })

		expect(native).toBe(true)
	})

	it('a logical node inside a vendor Private (another namespace) of its device → not native, the vendor Private kept in the chain', async () => {
		const { source } = await createSclTestProject({ sourceXml })

		const native = await nativeOf({
			query: source.document.query as Core.Query<Config>,
			id: 'vendor-ln0',
		})

		expect(native).toBe(false)
	})
})
