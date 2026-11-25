import { collectWithAncestry } from './collect-with-ancestry'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A bay holding a function in its SCL Private's place, and another inside a vendor Private (another namespace). */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay" name="B1">
					<v:Private xmlns:v="urn:vendor" ${id}="vendor-private" type="ACME">
						<Function ${id}="vendor-function" name="Vendor"/>
					</v:Private>
					<Function ${id}="function" name="Prot"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The ids above an element, from the document root down, as the read lays them. */
function ancestryIds(params: { ancestry: readonly { id: string }[] }): string[] {
	return params.ancestry.map(function idOf(record) {
		return record.id
	})
}

describe('collectWithAncestry, a section of the document - a vendor Private read as getTree reads it', () => {
	it('a function of the bay → reached from the bay', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const read = await collectWithAncestry(source.document.query as Core.Query<Config>, {
			select: { Substation: true },
		})

		expect(ancestryIds({ ancestry: read.ancestryOf('function') })).toEqual([
			'root',
			'sub',
			'vl',
			'bay',
		])
	})

	it('a function inside a vendor Private (another namespace) → reached through that Private, which is read too', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const read = await collectWithAncestry(source.document.query as Core.Query<Config>, {
			select: { Substation: true },
		})
		const ids = read.records.map(function idOf(record) {
			return record.id
		})

		expect(ids).toContain('vendor-private')
		expect(ancestryIds({ ancestry: read.ancestryOf('vendor-function') })).toEqual([
			'root',
			'sub',
			'vl',
			'bay',
			'vendor-private',
		])
	})
})
