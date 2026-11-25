import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

const NAMESPACE_6_100 = { prefix: 'eIEC61850-6-100', uri: 'http://www.iec.ch/61850/2019/SCL/6-100' }

/** A bay holding a vendor Private (another namespace) whose type is the 6-100 prefix, and no SCL Private. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay" name="B1">
					<v:Private xmlns:v="urn:vendor" ${id}="vendor-private" type="eIEC61850-6-100"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A bay whose SCL Private of type ACME holds a vendor Private (another namespace), the vendor's payload. */
const vendorPayloadXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay" name="B1">
					<Private ${id}="private" type="ACME">
						<v:Private xmlns:v="urn:vendor" ${id}="vendor-payload"/>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The namespace of each level above a record, nearest first, every stored level kept. */
async function storedChain(params: {
	query: Core.Query<Config>
	record: Scl.Ref<Scl.ElementsOf>
}): Promise<string[]> {
	const ancestors = await params.query.findAncestors(params.record, { unwrap: [] })
	return ancestors.map(function levelOf(ancestor) {
		return `${ancestor.tagName}@${ancestor.namespace.uri}`
	})
}

describe('the Private wrapper hook - a 6-100 element goes into an SCL Private, never a vendor one', () => {
	it('a variable added to a bay holding a vendor Private of the 6-100 type → wrapped in a new SCL Private, the vendor one left empty', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		await source.document.transaction(async function addVariable(tx) {
			await tx.addChild(
				{ tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>,
				{
					tagName: 'Variable',
					namespace: NAMESPACE_6_100,
					attributes: { name: 'VX', value: '1' },
				} as never,
			)
		})
		const query = source.document.query as Core.Query<Config>
		const [variable] = await query.getRecordsByTagName('Variable')
		const vendorPrivate = await query.getRecord({ tagName: 'Private', id: 'vendor-private' })
		const chain = await storedChain({ query, record: variable as Scl.Ref<Scl.ElementsOf> })

		expect(chain.slice(0, 2)).toEqual([
			'Private@http://www.iec.ch/61850/2003/SCL',
			'Bay@http://www.iec.ch/61850/2003/SCL',
		])
		expect(vendorPrivate?.children).toEqual([])
	})

	it('a variable added inside a vendor Private (another namespace) held by an SCL Private of another type → wrapped in a new SCL Private there, as anywhere else', async () => {
		const { source } = await createSclTestProject({ sourceXml: vendorPayloadXml })
		await source.document.transaction(async function addVariable(tx) {
			await tx.addChild(
				{ tagName: 'Private', id: 'vendor-payload' } as Scl.Ref<'Private'>,
				{
					tagName: 'Variable',
					namespace: NAMESPACE_6_100,
					attributes: { name: 'VX', value: '1' },
				} as never,
			)
		})
		const query = source.document.query as Core.Query<Config>
		const [variable] = await query.getRecordsByTagName('Variable')
		const chain = await storedChain({ query, record: variable as Scl.Ref<Scl.ElementsOf> })

		expect(chain.slice(0, 3)).toEqual([
			'Private@http://www.iec.ch/61850/2003/SCL',
			'Private@urn:vendor',
			'Private@http://www.iec.ch/61850/2003/SCL',
		])
	})
})
