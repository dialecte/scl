import { search } from './search'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A bay holding a function, and another held in a vendor Private (another namespace) inside its SCL Private. */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root">
		<Substation ${id}="sub" name="S1">
			<VoltageLevel ${id}="vl" name="V1">
				<Bay ${id}="bay" name="B1">
					<Private ${id}="private" type="ACME">
						<v:Private xmlns:v="urn:vendor" ${id}="vendor-private">
							<Function ${id}="vendor-function" name="ProtVendor"/>
						</v:Private>
					</Private>
					<Function ${id}="function" name="ProtOwn"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('info.search - a hit’s ancestors past the SCL Private only, as getTree reads them', () => {
	it('a function of the bay → its ancestors from the root to the bay', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const [hit] = await search(source.document.query as Core.Query<Config>, {
			term: 'ProtOwn',
			tagNames: ['Function'],
		})

		expect(hit?.ancestorIds).toEqual(['root', 'sub', 'vl', 'bay'])
	})

	it('a function held in a vendor Private (another namespace) → that vendor Private among its ancestors', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const [hit] = await search(source.document.query as Core.Query<Config>, {
			term: 'ProtVendor',
			tagNames: ['Function'],
		})

		expect(hit?.ancestorIds).toEqual(['root', 'sub', 'vl', 'bay', 'vendor-private'])
	})
})
