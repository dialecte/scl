import { landingParent } from './wrapper'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A function whose SCL Private holds a vendor Private (another namespace), which holds a setting of its own. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-s">
		<Substation ${id}="sub-s" name="S1">
			<VoltageLevel ${id}="vl-s" name="V1">
				<Bay ${id}="bay-s" name="B1">
					<Function ${id}="function-s" name="Prot">
						<Private ${id}="private-s" type="ACME">
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-private-s"><v:Setting ${id}="setting-s"/></v:Private>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The instance: the same function, its vendor Private empty. */
const targetXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-t">
		<Substation ${id}="sub-t" name="S1">
			<VoltageLevel ${id}="vl-t" name="V1">
				<Bay ${id}="bay-t" name="B1">
					<Function ${id}="function-t" name="Prot">
						<Private ${id}="private-t" type="ACME">
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-private-t"/>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('landingParent - only an SCL Private is a wrapper to land in', () => {
	it('a source element whose parent is a vendor Private (another namespace) → lands under the instance’s element, no wrapper made', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		const sourceQuery = source.document.query as Core.Query<Config>
		const sourceTree = await sourceQuery.any.getTree({
			tagName: 'Private',
			id: 'vendor-private-s',
		} as Scl.Ref<'Private'>)
		const [sourceChild] = sourceTree?.tree ?? []
		if (!sourceChild) throw new Error('no source child')
		let landing: unknown
		const prepared = await target.document.prepare(async function land(tx) {
			const instanceParent = await tx.any.getTree({
				tagName: 'Private',
				id: 'vendor-private-t',
			} as Scl.Ref<'Private'>)
			if (!instanceParent) throw new Error('no instance parent')
			landing = await landingParent(tx, { sourceQuery, sourceChild, instanceParent })
		})
		const created = prepared.operations.length
		prepared.discard()

		expect(landing).toMatchObject({ tagName: 'Private', id: 'vendor-private-t' })
		expect(created).toBe(0)
	})
})
