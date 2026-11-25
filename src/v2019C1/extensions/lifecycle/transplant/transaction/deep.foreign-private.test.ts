import { deep } from './deep'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A bay holding an SCL Private and a vendor Private (another namespace), both of type ACME, each with one setting. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-s">
		<Substation ${id}="sub-s" name="S1">
			<VoltageLevel ${id}="vl-s" name="V1">
				<Bay ${id}="bay-s" name="B1">
					<Private ${id}="scl-private-s" type="ACME"><v:Setting xmlns:v="urn:vendor" ${id}="scl-setting-s"/></Private>
					<v:Private xmlns:v="urn:vendor" ${id}="vendor-private-s" type="ACME"><v:Setting ${id}="vendor-setting-s"/></v:Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The bay to land on: it holds an SCL Private of type ACME. */
const targetXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-t">
		<Substation ${id}="sub-t" name="S1">
			<VoltageLevel ${id}="vl-t" name="V1">
				<Bay ${id}="bay-t" name="B1">
					<Private ${id}="scl-private-t" type="ACME"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A bay to land on that holds only a vendor Private (another namespace) of type ACME. */
const targetWithVendorPrivateXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-t">
		<Substation ${id}="sub-t" name="S1">
			<VoltageLevel ${id}="vl-t" name="V1">
				<Bay ${id}="bay-t" name="B1">
					<v:Private xmlns:v="urn:vendor" ${id}="vendor-private-t" type="ACME"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('import.deep - a Private merges into the SCL Private of its type, never across namespaces', () => {
	it('an SCL Private of a type the target bay holds → its children merged into that Private', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		await target.document.transaction(async function place(tx) {
			await deep(tx, {
				sourceQuery: source.document.query,
				ref: { tagName: 'Private', id: 'scl-private-s' } as Scl.Ref<'Private'>,
				targetParent: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>,
				withTypes: false,
			})
		})
		const bay = await target.document.query.getRecord({ tagName: 'Bay', id: 'bay-t' })
		const privates = bay?.children.filter((child) => child.tagName === 'Private') ?? []
		const sclPrivate = await target.document.query.getRecord({
			tagName: 'Private',
			id: 'scl-private-t',
		})

		expect(privates.map((child) => child.id)).toEqual(['scl-private-t'])
		expect(sclPrivate?.children).toHaveLength(1)
	})

	it('a vendor Private (another namespace) of that type → cloned as its own element, the SCL Private left as it was', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		await target.document.transaction(async function place(tx) {
			await deep(tx, {
				sourceQuery: source.document.query,
				ref: { tagName: 'Private', id: 'vendor-private-s' } as Scl.Ref<'Private'>,
				targetParent: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>,
				withTypes: false,
			})
		})
		const sclPrivate = await target.document.query.getRecord({
			tagName: 'Private',
			id: 'scl-private-t',
		})
		const bay = await target.document.query.getRecord({ tagName: 'Bay', id: 'bay-t' })

		expect(sclPrivate?.children).toEqual([])
		expect(bay?.children.filter((child) => child.tagName === 'Private')).toHaveLength(2)
	})
	it('an SCL Private of a type a vendor Private of the target bay has → cloned as its own, the vendor Private left as it was', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml,
			targetXml: targetWithVendorPrivateXml,
		})
		if (!target) throw new Error('target required')
		await target.document.transaction(async function place(tx) {
			await deep(tx, {
				sourceQuery: source.document.query,
				ref: { tagName: 'Private', id: 'scl-private-s' } as Scl.Ref<'Private'>,
				targetParent: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>,
				withTypes: false,
			})
		})
		const vendorPrivate = await target.document.query.getRecord({
			tagName: 'Private',
			id: 'vendor-private-t',
		})
		const bay = await target.document.query.getRecord({ tagName: 'Bay', id: 'bay-t' })

		expect(vendorPrivate?.children).toEqual([])
		expect(bay?.children.filter((child) => child.tagName === 'Private')).toHaveLength(2)
	})
})
