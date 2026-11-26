import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A bay whose SCL Private holds an empty vendor Private (another namespace): no type, no value, no content. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay" name="B1">
					<Private ${id}="private" type="ACME">
						<v:Private xmlns:v="urn:vendor" ${id}="vendor-private"/>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-t">
		<Substation ${id}="sub-t" name="S1">
			<VoltageLevel ${id}="vl-t" name="V1"/>
		</Substation>
	</SCL>
`

describe('the clone of a tree - an empty vendor Private is a vendor element, kept', () => {
	it('a bay whose SCL Private holds an empty vendor Private (another namespace) cloned → both cloned, the vendor one in the SCL one', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		await target.document.transaction(async function clone(tx) {
			await tx.lifecycle.transplant.deep({
				sourceQuery: source.document.query,
				ref: { tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>,
				targetParent: { tagName: 'VoltageLevel', id: 'vl-t' } as Scl.Ref<'VoltageLevel'>,
				withTypes: false,
			})
		})
		const privates = await (target.document.query as Core.Query<Config>).getRecordsByTagName(
			'Private',
		)

		const namespaces = privates
			.map(function namespaceOf(record) {
				return record.namespace.uri
			})
			.sort()

		expect(namespaces).toEqual(['http://www.iec.ch/61850/2003/SCL', 'urn:vendor'])
	})
})
