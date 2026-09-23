import { computeMappedReferenceAttributes } from './build-mapped-name'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE

describe('computeMappedReferenceAttributes', () => {
	it('writes the mapped name and UUID for a UC1 data-name deviation', async () => {
		const { source } = await createSclTestProject({
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1"><AccessPoint name="AP1" ${ID}="ap-1"><Server ${ID}="server-1">
					<LDevice inst="LD0" ${ID}="ld-1"><LN lnClass="XCBR" inst="1" prefix="" uuid="ln-uuid" ${ID}="ln-1"/></LDevice>
				</Server></AccessPoint></IED>
				<Substation name="S1" ${ID}="sub-1"><LNode iedName="IED1" ldInst="LD0" prefix="" lnClass="XCBR" lnInst="1" ${ID}="lnode-1">
					<Private type="eIEC61850-6-100"><eIEC61850-6-100:DOS name="Mod" ${ID}="dos-1"/></Private>
				</LNode></Substation>
			</SCL>
		`,
		})
		const record = await source.document.query.getRecord({ tagName: 'DOS', id: 'dos-1' })

		const result = await computeMappedReferenceAttributes(source.document.query, {
			record: record as unknown as Scl.RawRecord<Scl.ElementsOf>,
			target: { ln: { tagName: 'LN', id: 'ln-1' }, dataPath: ['Health'] },
		})

		expect(result).toEqual({ mappedName: 'Health', mappedLnUuid: 'ln-uuid' })
	})

	it('clears both attributes for a UC1 name match', async () => {
		const { source } = await createSclTestProject({
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1"><AccessPoint name="AP1" ${ID}="ap-1"><Server ${ID}="server-1">
					<LDevice inst="LD0" ${ID}="ld-1"><LN lnClass="XCBR" inst="1" prefix="" uuid="ln-uuid" ${ID}="ln-1"/></LDevice>
				</Server></AccessPoint></IED>
				<Substation name="S1" ${ID}="sub-1"><LNode iedName="IED1" ldInst="LD0" prefix="" lnClass="XCBR" lnInst="1" ${ID}="lnode-1">
					<Private type="eIEC61850-6-100"><eIEC61850-6-100:DOS name="Mod" ${ID}="dos-1"/></Private>
				</LNode></Substation>
			</SCL>
		`,
		})
		const record = await source.document.query.getRecord({ tagName: 'DOS', id: 'dos-1' })

		const result = await computeMappedReferenceAttributes(source.document.query, {
			record: record as unknown as Scl.RawRecord<Scl.ElementsOf>,
			target: { ln: { tagName: 'LN', id: 'ln-1' }, dataPath: ['Mod'] },
		})

		expect(result).toEqual({ mappedName: undefined, mappedLnUuid: undefined })
	})

	it('writes a full ObjectReference for an explicit mapping under an unmapped LNode', async () => {
		const { source } = await createSclTestProject({
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1"><AccessPoint name="AP1" ${ID}="ap-1"><Server ${ID}="server-1">
					<LDevice inst="LD0" ${ID}="ld-1"><LN lnClass="XCBR" inst="1" prefix="" uuid="ln-uuid" ${ID}="ln-1"/></LDevice>
				</Server></AccessPoint></IED>
				<Substation name="S1" ${ID}="sub-1"><LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="lnode-1">
					<Private type="eIEC61850-6-100"><eIEC61850-6-100:DOS name="Mod" ${ID}="dos-1"/></Private>
				</LNode></Substation>
			</SCL>
		`,
		})
		const record = await source.document.query.getRecord({ tagName: 'DOS', id: 'dos-1' })

		const result = await computeMappedReferenceAttributes(source.document.query, {
			record: record as unknown as Scl.RawRecord<Scl.ElementsOf>,
			target: { ln: { tagName: 'LN', id: 'ln-1' }, dataPath: ['Health'] },
		})

		expect(result).toEqual({
			mappedName: 'IED1/LD0/XCBR1.Health',
			mappedLnUuid: 'ln-uuid',
		})
	})
})
