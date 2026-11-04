import { fsd as updateFsd } from './fsd'

import { describe, expect, it } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { reference } from '@/v2019C1/extensions/reference'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	preInstantiate: boolean
	mutate?: (tx: Scl.Transaction) => Promise<void>
}

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

// Same as `sourceXml` but the template Function carries a `desc` — so an instance
// gets it on instantiate and a later template that DROPS it must clear it on reconcile.
const sourceWithDescXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" desc="rev1" ${id}="fn-1" uuid="fn-src-uuid">
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

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('update.fsd (engine: instantiate-or-reconcile)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'clears an attribute the template dropped (present on instance, absent on template)': {
			sourceXml: sourceWithDescXml,
			targetXml,
			preInstantiate: true,
			mutate: async (tx) => {
				// the newer template no longer carries `desc`
				await tx.update(functionRef, { attributes: { desc: undefined } })
			},
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
			],
			unexpectedQueries: [
				// reconcile must remove the now-absent attribute, not leave the stale instance value
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@desc]',
			],
		},

		'a template going back to its default desc="" → the instance takes the template value, the attribute kept':
			{
				sourceXml: sourceWithDescXml,
				targetXml,
				preInstantiate: true,
				mutate: async (tx) => {
					await tx.update(functionRef, { attributes: { desc: '' } })
				},
				expectedQueries: [
					// the template's own value is written, as for an attribute whose default is fixed
					'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"][@desc=""]',
				],
			},

		'reconciles onto the existing instance: updates in place + adds new, no duplicate': {
			sourceXml,
			targetXml,
			preInstantiate: true,
			mutate: async (tx) => {
				await tx.update(functionRef, { attributes: { desc: 'v2' } })
				await tx.addChild(functionRef, {
					tagName: 'LNode',
					attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '1', lnType: 'CSWI_Type' },
				})
			},
			expectedQueries: [
				// the change lands on the SAME lineage-linked instance (updated in place)
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"][@desc="v2"]',
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"]/default:LNode[@lnClass="XCBR"]',
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"]',
			],
			unexpectedQueries: [
				// no stale duplicate: no second Prot left without the update
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][not(@desc)]',
			],
		},

		'deletes an instance element removed from the template': {
			sourceXml,
			targetXml,
			preInstantiate: true,
			mutate: async (tx) => {
				await tx.delete({ tagName: 'LNode', id: 'lnode-1' } as Scl.Ref<'LNode'>)
			},
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
			],
			unexpectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"]',
			],
		},

		'instantiates fresh when the target holds no instance yet (first-time = update auto)': {
			sourceXml,
			targetXml,
			preInstantiate: false,
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
			],
			unexpectedQueries: [
				// the instance receives a fresh uuid; the source uuid survives only as templateUuid
				'//default:Function[@uuid="fn-src-uuid"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		if (testCase.preInstantiate) {
			await target.transaction(async (tx) => {
				await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
			})
		}
		if (testCase.mutate) {
			await source.transaction(testCase.mutate)
		}
		await target.transaction(async (tx) => {
			await updateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('update.fsd — returns the applied instance roots', () => {
	it('instantiate scenario: returns the freshly placed Function root', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		let result: Awaited<ReturnType<typeof updateFsd>> | undefined
		await target.document.transaction(async (tx) => {
			result = await updateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
				scenario: 'instantiate',
			})
		})

		expect(result).toHaveLength(1)
		expect(result?.[0]?.ref.tagName).toBe('Function')
	})

	it('reconcile scenario: returns the matched existing instance root', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		await target.document.transaction(async (tx) => {
			await instantiateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
			})
		})

		let result: Awaited<ReturnType<typeof updateFsd>> | undefined
		await target.document.transaction(async (tx) => {
			result = await updateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
			})
		})

		expect(result).toHaveLength(1)
		expect(result?.[0]?.ref.tagName).toBe('Function')
	})

	it('called without decisions from the revision it already names: the matched instance is returned as reconciled, its file reference as it was', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		await target.document.transaction(async (tx) => {
			await instantiateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
			})
		})
		const provenanceBefore = await reference.query.getProvenance(target.document.query)

		let result: Awaited<ReturnType<typeof updateFsd>> | undefined
		await target.document.transaction(async (tx) => {
			result = await updateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
			})
		})
		const provenanceAfter = await reference.query.getProvenance(target.document.query)

		expect(result?.map((instance) => instance.placement)).toEqual(['reconciled'])
		expect(provenanceBefore).toHaveLength(1)
		expect(provenanceAfter).toEqual(provenanceBefore)
	})
})
