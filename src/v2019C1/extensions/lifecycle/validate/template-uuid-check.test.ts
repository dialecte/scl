import { checkTemplateUuids } from './template-uuid-check'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A legitimate `templateUuid` identifies ONE template element, so it is either unique per instance
// or shared only across instances of the SAME element type (multi-instance). A value reused across
// DIFFERENT element types cannot be a single template — it is a placeholder/authoring artefact.
// The checker flags exactly that, with no false positive on legit sharing.
const DUMMY = '123e4567-e89b-12d3-a456-789012345678'

describe('checkTemplateUuids — flags illegitimate cross-type templateUuid reuse', () => {
	it('warns when one templateUuid is shared across unrelated element types', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" templateUuid="${DUMMY}" ${id}="sub">
					<Private type="eIEC61850-6-100" ${id}="priv">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="piu" templateUuid="${DUMMY}" ${id}="ar"/>
					</Private>
					<VoltageLevel name="V1" uuid="vl" templateUuid="${DUMMY}" ${id}="vl"/>
				</Substation>
			</SCL>`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const warnings = await checkTemplateUuids(source.document.query)

		expect(warnings).toHaveLength(1)
		expect(warnings[0].code).toBe('cross-type-template-uuid')
		expect(warnings[0].value).toBe(DUMMY)
		expect(warnings[0].count).toBe(3)
		expect(new Set(warnings[0].tagNames)).toEqual(
			new Set(['Substation', 'AllocationRole', 'VoltageLevel']),
		)
	})

	it('does not warn on legit sharing (same type) or unique templateUuids', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" templateUuid="tpl-sub" ${id}="sub">
					<Private type="eIEC61850-6-100" ${id}="priv">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="piu" templateUuid="tpl-ar" ${id}="ar1"/>
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="piu2" templateUuid="tpl-ar" ${id}="ar2"/>
					</Private>
				</Substation>
			</SCL>`
		const { source } = await createSclTestProject({ sourceXml: xml })

		expect(await checkTemplateUuids(source.document.query)).toEqual([])
	})
})

describe('checkTemplateUuids — duplicate instance uuid', () => {
	it('warns when the same uuid is used by more than one element', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" ${id}="sub">
					<VoltageLevel name="V1" uuid="dup" ${id}="vl1"/>
					<VoltageLevel name="V2" uuid="dup" ${id}="vl2"/>
				</Substation>
			</SCL>`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const dup = (await checkTemplateUuids(source.document.query)).filter(
			(w) => w.code === 'duplicate-instance-uuid',
		)

		expect(dup).toHaveLength(1)
		expect(dup[0].value).toBe('dup')
		expect(dup[0].count).toBe(2)
	})

	it('does not warn when every uuid is unique', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" ${id}="sub">
					<VoltageLevel name="V1" uuid="v1" ${id}="vl1"/>
					<VoltageLevel name="V2" uuid="v2" ${id}="vl2"/>
				</Substation>
			</SCL>`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const dup = (await checkTemplateUuids(source.document.query)).filter(
			(w) => w.code === 'duplicate-instance-uuid',
		)
		expect(dup).toEqual([])
	})
})

describe('checkTemplateUuids — templateUuid type mismatch', () => {
	it('warns when a templateUuid resolves in-file to an element of a different type', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="TEMPLATE" uuid="X" ${id}="sub">
					<Private type="eIEC61850-6-100" ${id}="priv">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="ar" templateUuid="X" ${id}="arole"/>
					</Private>
				</Substation>
			</SCL>`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const mismatch = (await checkTemplateUuids(source.document.query)).filter(
			(w) => w.code === 'template-uuid-type-mismatch',
		)

		expect(mismatch).toHaveLength(1)
		expect(mismatch[0].value).toBe('X')
		expect(new Set(mismatch[0].tagNames)).toEqual(new Set(['AllocationRole', 'Substation']))
	})

	it('does not warn when a templateUuid resolves to an element of the SAME type', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" ${id}="sub">
					<VoltageLevel name="TEMPLATE" uuid="X" ${id}="tpl"/>
					<VoltageLevel name="V1" uuid="v1" templateUuid="X" ${id}="inst"/>
				</Substation>
			</SCL>`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const mismatch = (await checkTemplateUuids(source.document.query)).filter(
			(w) => w.code === 'template-uuid-type-mismatch',
		)
		expect(mismatch).toEqual([])
	})
})
