import { resolveSsdScope } from './resolve-ssd-scope'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** Two bays linked by a terminal, their TEMPLATE scaffolding holding an SCL Private and a vendor Private (another namespace). */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="scl-1">
		<Substation name="TEMPLATE" ${id}="sub-1">
			<VoltageLevel name="TEMPLATE" ${id}="vl-1">
				<Private type="ACME" ${id}="scl-private">vendor flag</Private>
				<v:Private xmlns:v="urn:vendor" type="ACME" ${id}="vendor-private"><v:Setting ${id}="vendor-setting"/></v:Private>
				<Bay name="B1" uuid="b1-uuid" ${id}="bay-1">
					<ConnectivityNode name="L1" pathName="TEMPLATE/TEMPLATE/B1/L1" uuid="node-uuid" ${id}="node-1"/>
				</Bay>
				<Bay name="B2" uuid="b2-uuid" ${id}="bay-2">
					<ConductingEquipment name="QA1" type="CBR" uuid="qa2-uuid" ${id}="equipment-2">
						<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/B1/L1" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="B1" cNodeName="L1" cNodeUuid="node-uuid" ${id}="terminal-2"/>
					</ConductingEquipment>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('resolveSsdScope - what the scaffolding of linked units holds of its own', () => {
	it('an SCL Private and a vendor Private (another namespace) on the scaffolding → the vendor one left out with what it holds, the SCL one kept', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const scope = await resolveSsdScope(source.document.query as Core.Query<Config>, {})
		const leftOut = [...(scope?.leftOut ?? [])].sort()

		expect(scope?.units.map((unit) => unit.id)).toEqual(['bay-1', 'bay-2'])
		expect(leftOut).toEqual(['vendor-private', 'vendor-setting'])
	})
})
