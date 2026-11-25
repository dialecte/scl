import { diffTextWrappers } from './text-wrappers'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A function holding a text-only SCL Private and a text-only vendor Private (another namespace). */
const sourceXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-s">
		<Substation ${id}="sub-s" name="S1">
			<VoltageLevel ${id}="vl-s" name="V1">
				<Bay ${id}="bay-s" name="B1">
					<Function ${id}="function-s" name="Prot">
						<Private ${id}="private-s" type="ACME">scl text</Private>
						<Private ${id}="holder-s" type="VENDOR">
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-private-s" type="ACME">vendor text</v:Private>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The instance: the same function, holding no wrapper. */
const targetXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${id}="root-t">
		<Substation ${id}="sub-t" name="S1">
			<VoltageLevel ${id}="vl-t" name="V1">
				<Bay ${id}="bay-t" name="B1">
					<Function ${id}="function-t" name="Prot"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('diffTextWrappers - the text-only wrappers are the SCL Privates', () => {
	it('an SCL Private holding a text-only vendor Private (another namespace) → no text wrapper listed: the vendor Private is an element of its own', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		const sourceQuery = source.document.query as Core.Query<Config>
		const targetQuery = target.document.query as Core.Query<Config>
		const sourceNode = await sourceQuery.any.getTree({
			tagName: 'Private',
			id: 'holder-s',
		} as Scl.Ref<'Private'>)
		const instanceNode = await targetQuery.any.getTree({
			tagName: 'Function',
			id: 'function-t',
		} as Scl.Ref<'Function'>)
		if (!sourceNode || !instanceNode) throw new Error('trees required')
		const nodes = await diffTextWrappers(sourceQuery, { targetQuery, sourceNode, instanceNode })

		expect(nodes).toEqual([])
	})
})
