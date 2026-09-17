import { findInstancesByTemplateUuid } from './find-instance'

import { describe, expect, it } from 'vitest'

import { resolveIdentity } from '@/v2019C1/extensions/identity/query'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" uuid="sub-uuid" ${id}="sub-t"/>
		<DataTypeTemplates ${id}="dtt-t">
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-t"/>
			<DOType id="SPS_Type" cdc="SPS" ${id}="dot-t2"/>
		</DataTypeTemplates>
	</SCL>`

describe('findInstancesByTemplateUuid — schema-driven, no name fallback', () => {
	it('uuid-bearing: a lineage miss is a miss (no name adoption)', async () => {
		const { target } = await createSclTestProject({ sourceXml: targetXml, targetXml })
		if (!target) throw new Error('target')
		// no target Substation carries templateUuid === 'nope'; Substation is uuid-bearing → []
		const found = await findInstancesByTemplateUuid(target.document.query, {
			tagName: 'Substation',
			sourceUuid: 'nope',
		})
		expect(found).toHaveLength(0)
	})

	it('uuid-less: matches by the identityFields tuple (DataTypeTemplates by id)', async () => {
		const { target } = await createSclTestProject({ sourceXml: targetXml, targetXml })
		if (!target) throw new Error('target')
		const sourceIdentity = await resolveIdentity(target.document.query, {
			tagName: 'DOType',
			id: 'dot-t',
		} as Scl.Ref<Scl.ElementsOf>)
		const found = await findInstancesByTemplateUuid(target.document.query, {
			tagName: 'DOType' as Scl.ElementsOf,
			sourceUuid: undefined,
			sourceIdentity,
		})
		expect(found).toHaveLength(1)
		const foundId = found[0]?.attributes.find((attribute) => attribute.name === 'id')?.value
		expect(foundId).toBe('DPC_Type')
	})
})
