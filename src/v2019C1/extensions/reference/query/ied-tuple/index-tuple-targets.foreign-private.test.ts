import { indexTupleTargets } from './index-tuple-targets'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** An IED's logical node, a copy of it in an SCL Private and one in a vendor Private (another namespace). */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
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

describe('indexTupleTargets - a target under any Private is vendor payload, never indexed', () => {
	it('the IED’s logical node, a copy in an SCL Private, one in a vendor Private → the IED’s own only', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const query = source.document.query as Core.Query<Config>
		const targets: AnyRawRecord[] = []
		const ancestries = new Map<string, AnyRawRecord[]>()
		for (const [tagName, recordId] of [
			['LN0', 'ln0'],
			['LN', 'scl-copy'],
			['LN', 'vendor-copy'],
		] as const) {
			const record = await query.getRecord({ tagName, id: recordId } as Scl.Ref<'LN'>)
			if (!record) throw new Error(`no ${recordId}`)
			targets.push(record)
			const ancestry = await query.findAncestors(record, { unwrap: [], order: 'top-down' })
			ancestries.set(record.id, ancestry)
		}
		const index = indexTupleTargets({ targets, ancestries })

		expect([...index.byUuid.keys()]).toEqual(['ln0-uuid'])
	})
})
