import { ensureLNodeSpecNaming } from './lnode-spec-naming'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** An LNode holding a vendor Private (another namespace) of the 6-100 type, directly; the import names the LNode. */
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

describe('ensureLNodeSpecNaming - an LNode’s naming written in an SCL Private, never a vendor one', () => {
	it('the naming of an LNode holding a vendor Private of the 6-100 type removed → the new naming placed outside the vendor Private', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const query = source.document.query as Core.Query<Config>
		const [imported] = await query.getRecordsByTagName('LNodeSpecNaming')
		if (!imported) throw new Error('the import names the LNode')
		let operations: Scl.Operation[] = []
		const prepared = await source.document.prepare(async function rename(tx) {
			await tx.delete(imported as Scl.Ref<Scl.ElementsOf>)
			operations = await ensureLNodeSpecNaming(tx as unknown as Core.Query<Config>, {
				lnode: { tagName: 'LNode', id: 'lnode' } as Scl.Ref<'LNode'>,
			})
		})
		prepared.discard()
		const naming = operations.find(function isNaming(operation) {
			return operation.status === 'created' && operation.newRecord.tagName === 'LNodeSpecNaming'
		})

		expect(naming).toBeDefined()
		expect(naming?.status === 'created' ? naming.newRecord.parent?.id : undefined).not.toBe(
			'vendor-private',
		)
	})
})
