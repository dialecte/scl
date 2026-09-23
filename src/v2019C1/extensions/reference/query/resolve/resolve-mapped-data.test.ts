import { resolveMappedData } from './resolve-mapped-data'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE

describe('resolveMappedData', () => {
	it('resolves an explicit mapped name and UUID to its LN and data path', async () => {
		const { source } = await createSclTestProject({
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1"><Server ${ID}="server-1">
						<LDevice inst="LD0" ${ID}="ld-1">
							<LN lnClass="XCBR" inst="1" prefix="" uuid="ln-uuid" ${ID}="ln-1"/>
						</LDevice>
					</Server></AccessPoint>
				</IED>
				<Substation name="S1" ${ID}="sub-1"><LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="lnode-1">
					<Private type="eIEC61850-6-100"><eIEC61850-6-100:DOS name="Mod" mappedDoName="Health" mappedLnUuid="ln-uuid" ${ID}="dos-1"/></Private>
				</LNode></Substation>
			</SCL>
		`,
		})
		const record = await source.document.query.getRecord({ tagName: 'DOS', id: 'dos-1' })

		const result = await resolveMappedData(
			source.document.query,
			record as Scl.TrackedRecord<Scl.ElementsOf>,
		)

		expect(result).toMatchObject({
			ln: { tagName: 'LN', id: 'ln-1' },
			dataPath: ['Health'],
			source: 'record',
		})
	})

	it('inherits an unannotated top-level DOS from a mapped LNode', async () => {
		const { source } = await createSclTestProject({
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1"><AccessPoint name="AP1" ${ID}="ap-1"><Server ${ID}="server-1">
					<LDevice inst="LD0" ${ID}="ld-1"><LN lnClass="XCBR" inst="1" prefix="" uuid="ln-uuid" ${ID}="ln-1"/></LDevice>
				</Server></AccessPoint></IED>
				<Substation name="S1" ${ID}="sub-1"><LNode iedName="IED1" ldInst="LD0" prefix="" lnClass="XCBR" lnInst="1" ${ID}="lnode-1">
					<Private type="eIEC61850-6-100"><eIEC61850-6-100:DOS name="Pos" ${ID}="dos-1"/></Private>
				</LNode></Substation>
			</SCL>
		`,
		})
		const record = await source.document.query.getRecord({ tagName: 'DOS', id: 'dos-1' })

		const result = await resolveMappedData(
			source.document.query,
			record as Scl.TrackedRecord<Scl.ElementsOf>,
		)

		expect(result).toMatchObject({
			ln: { tagName: 'LN', id: 'ln-1' },
			dataPath: ['Pos'],
			source: 'lnode',
		})
	})

	it('inherits the parent data mapping and extends its data path', async () => {
		const { source } = await createSclTestProject({
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1"><AccessPoint name="AP1" ${ID}="ap-1"><Server ${ID}="server-1">
					<LDevice inst="LD0" ${ID}="ld-1"><LN lnClass="XCBR" inst="1" prefix="" uuid="ln-uuid" ${ID}="ln-1"/></LDevice>
				</Server></AccessPoint></IED>
				<Substation name="S1" ${ID}="sub-1"><LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="lnode-1">
					<Private type="eIEC61850-6-100"><eIEC61850-6-100:DOS name="Mod" mappedDoName="IED1/LD0/XCBR1.Health" mappedLnUuid="ln-uuid" ${ID}="dos-1">
						<eIEC61850-6-100:SDS name="child" ${ID}="sds-1"/>
					</eIEC61850-6-100:DOS></Private>
				</LNode></Substation>
			</SCL>
		`,
		})
		const record = await source.document.query.getRecord({ tagName: 'SDS', id: 'sds-1' })

		const result = await resolveMappedData(
			source.document.query,
			record as Scl.TrackedRecord<Scl.ElementsOf>,
		)

		expect(result).toMatchObject({
			ln: { tagName: 'LN', id: 'ln-1' },
			dataPath: ['Health', 'child'],
			source: 'ancestor-data',
		})
	})

	it('does not guess a data path from an isolated UUID', async () => {
		const { source } = await createSclTestProject({
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1"><AccessPoint name="AP1" ${ID}="ap-1"><Server ${ID}="server-1">
					<LDevice inst="LD0" ${ID}="ld-1"><LN lnClass="XCBR" inst="1" prefix="" uuid="ln-uuid" ${ID}="ln-1"/></LDevice>
				</Server></AccessPoint></IED>
				<Substation name="S1" ${ID}="sub-1"><LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="lnode-1">
					<Private type="eIEC61850-6-100"><eIEC61850-6-100:DOS name="Mod" mappedLnUuid="ln-uuid" ${ID}="dos-1"/></Private>
				</LNode></Substation>
			</SCL>
		`,
		})
		const record = await source.document.query.getRecord({ tagName: 'DOS', id: 'dos-1' })

		const result = await resolveMappedData(
			source.document.query,
			record as Scl.TrackedRecord<Scl.ElementsOf>,
		)

		expect(result).toBeUndefined()
	})
})
