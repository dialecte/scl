import { resolveIdentity, identityEquals } from './resolve-identity'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const doc = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" uuid="sub-1" ${id}="sub">
			<VoltageLevel name="V1" uuid="vl-1" ${id}="vl">
				<Bay name="TEMPLATE" uuid="bay-1" ${id}="bay">
					<Function name="Prot" uuid="fn-1" ${id}="fn"/>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt">
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot"/>
		</DataTypeTemplates>
	</SCL>
`

describe('resolveIdentity (query-based)', () => {
	it('uuid-bearing element → uuid identity (name ignored even when an identityField)', async () => {
		const { target } = await createSclTestProject({ sourceXml: doc, targetXml: doc })
		if (!target) throw new Error('target')
		const query = target.document.query

		expect(
			await resolveIdentity(query, { tagName: 'Function', id: 'fn' } as Scl.Ref<'Function'>),
		).toEqual({ kind: 'uuid', uuid: 'fn-1' })
		// Substation has identityFields ['name'] AND a uuid → still uuid identity, name unused
		expect(
			await resolveIdentity(query, { tagName: 'Substation', id: 'sub' } as Scl.Ref<'Substation'>),
		).toEqual({ kind: 'uuid', uuid: 'sub-1' })
	})

	it('no-uuid element with identityFields → fields identity (DataTypeTemplates by id)', async () => {
		const { target } = await createSclTestProject({ sourceXml: doc, targetXml: doc })
		if (!target) throw new Error('target')
		expect(
			await resolveIdentity(target.document.query, {
				tagName: 'DOType',
				id: 'dot',
			} as Scl.Ref<Scl.ElementsOf>),
		).toEqual({ kind: 'fields', fields: { id: 'DPC_Type' } })
	})

	it('identityEquals: uuid needs a shared defined value; positional never equal', () => {
		expect(identityEquals({ kind: 'uuid', uuid: 'a' }, { kind: 'uuid', uuid: 'a' })).toBe(true)
		expect(identityEquals({ kind: 'uuid', uuid: 'a' }, { kind: 'uuid', uuid: 'b' })).toBe(false)
		expect(
			identityEquals({ kind: 'uuid', uuid: undefined }, { kind: 'uuid', uuid: undefined }),
		).toBe(false)
		expect(
			identityEquals(
				{ kind: 'fields', fields: { id: 'x' } },
				{ kind: 'fields', fields: { id: 'x' } },
			),
		).toBe(true)
		expect(
			identityEquals(
				{ kind: 'fields', fields: { id: 'x' } },
				{ kind: 'fields', fields: { id: 'y' } },
			),
		).toBe(false)
		expect(identityEquals({ kind: 'positional' }, { kind: 'positional' })).toBe(false)
	})
})
