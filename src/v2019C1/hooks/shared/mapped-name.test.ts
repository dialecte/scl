import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test/hydrated-test'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE

function xml(mappedLNode: boolean, attributes = ''): string {
	return /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
			<IED name="IED1" ${ID}="ied-1"><AccessPoint name="AP1" ${ID}="ap-1"><Server ${ID}="server-1">
				<LDevice inst="LD0" ${ID}="ld-1"><LN lnClass="XCBR" inst="1" prefix="" uuid="ln-uuid" ${ID}="ln-1"/></LDevice>
			</Server></AccessPoint></IED>
			<Substation name="S1" ${ID}="sub-1"><LNode ${
				mappedLNode
					? 'iedName="IED1" ldInst="LD0" prefix="" lnClass="XCBR" lnInst="1"'
					: 'iedName="None" lnClass="XCBR" lnInst="1"'
			} ${ID}="lnode-1">
				<Private type="eIEC61850-6-100"><eIEC61850-6-100:DOS name="Mod" ${attributes} ${ID}="dos-1"/></Private>
			</LNode></Substation>
		</SCL>
	`
}

describe('mapped-name record hook', () => {
	it('normalizes a UC1 deviation and keeps the UUID companion', async () => {
		const { source } = await createSclTestProject({ sourceXml: xml(true) })

		await source.document.transaction((tx) =>
			tx.update(
				{ tagName: 'DOS', id: 'dos-1' },
				{ attributes: { mappedDoName: 'IED1/LD0/XCBR1.Health', mappedLnUuid: 'ln-uuid' } },
			),
		)

		const attributes = await source.document.query.getAttributes({ tagName: 'DOS', id: 'dos-1' })
		expect(attributes).toMatchObject({ mappedDoName: 'Health', mappedLnUuid: 'ln-uuid' })
	})

	it('clears both attributes for a UC1 name match', async () => {
		const { source } = await createSclTestProject({ sourceXml: xml(true) })

		await source.document.transaction((tx) =>
			tx.update(
				{ tagName: 'DOS', id: 'dos-1' },
				{ attributes: { mappedDoName: 'IED1/LD0/XCBR1.Mod', mappedLnUuid: 'ln-uuid' } },
			),
		)

		const attributes = await source.document.query.getAttributes({ tagName: 'DOS', id: 'dos-1' })
		expect(attributes.mappedDoName).toBeUndefined()
		expect(attributes.mappedLnUuid).toBeUndefined()
	})

	it('preserves a resolvable full ObjectReference below an unmapped LNode', async () => {
		const { source } = await createSclTestProject({
			sourceXml: xml(false, 'mappedDoName="IED1/LD0/XCBR1.Health" mappedLnUuid="ln-uuid"'),
		})

		await source.document.transaction((tx) =>
			tx.update({ tagName: 'DOS', id: 'dos-1' }, { attributes: { desc: 'touched' } }),
		)

		const attributes = await source.document.query.getAttributes({ tagName: 'DOS', id: 'dos-1' })
		expect(attributes.mappedDoName).toBe('IED1/LD0/XCBR1.Health')
		expect(attributes.mappedLnUuid).toBe('ln-uuid')
	})

	it('preserves an ambiguous UUID-only record', async () => {
		const { source } = await createSclTestProject({
			sourceXml: xml(false, 'mappedLnUuid="ln-uuid"'),
		})

		await source.document.transaction((tx) =>
			tx.update({ tagName: 'DOS', id: 'dos-1' }, { attributes: { desc: 'touched' } }),
		)

		const attributes = await source.document.query.getAttributes({ tagName: 'DOS', id: 'dos-1' })
		expect(attributes.mappedDoName).toBeUndefined()
		expect(attributes.mappedLnUuid).toBe('ln-uuid')
	})
})
