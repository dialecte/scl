import { diff } from './diff'

import { describe, expect, it } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

/** A template function with one logical node and its types. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

/** A project bay to place the function in. */
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The nodes of a diff tree the project holds and the template does not, each the root of what it holds. */
function targetOnly(node: DiffNode): string[] {
	if (node.change === 'target-only') return [node.tagName]
	return node.children.flatMap(targetOnly)
}

describe('diff - what the project added to an instance, a vendor Private read as core reads it', () => {
	it('the instance holds a vendor Private (another namespace) with a setting → the vendor Private listed as the project’s own, not its setting', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		await target.document.transaction(async function place(tx) {
			await instantiateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
			})
		})
		const [instanceFunction] = await target.document.query.any.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'fn-src-uuid' },
		})
		if (!instanceFunction) throw new Error('instance not found')
		await target.document.transaction(async function addVendorContent(tx) {
			const vendor = { prefix: 'v', uri: 'urn:vendor' }
			const vendorPrivate = await tx.addChild(
				instanceFunction as Scl.Ref<'Function'>,
				{
					tagName: 'Private',
					namespace: vendor,
					attributes: { type: 'ACME' },
				} as never,
			)
			await tx.addChild(vendorPrivate as never, { tagName: 'Setting', namespace: vendor } as never)
		})

		const report = await diff({
			sourceQuery: source.document.query,
			targetQuery: target.document.query,
			sourceRootRef: functionRef,
			instanceRootRef: instanceFunction,
		})

		expect(targetOnly(report.root)).toEqual(['Private'])
	})
})
