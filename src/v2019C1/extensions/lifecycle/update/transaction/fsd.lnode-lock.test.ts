import { fsd as updateFsd } from './fsd'

import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** Mutate the target instance (e.g. bind an LNode to an IED) before reconcile. */
	mutateTarget?: (tx: Scl.Transaction) => Promise<void>
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
	</SCL>`

// Target already holds a real IED "VENDOR_A" the instance LNode can be bound to.
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
		<IED name="VENDOR_A" manufacturer="SIEMENS" ${id}="ied-t"/>
	</SCL>`

async function bindInstanceLnode(
	tx: Scl.Transaction,
	attributes: Record<string, string>,
): Promise<void> {
	const [lnode] = await tx.findByAttributes({
		tagName: 'LNode',
		attributes: { templateUuid: 'lnode-src-uuid' },
	})
	if (!lnode) throw new Error('instance LNode not found')
	await tx.update({ tagName: 'LNode', id: lnode.id } as Scl.Ref<'LNode'>, { attributes })
}

describe('update.fsd — locked LNode identity + lnType protection', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'keeps the full identity + lnType of an LNode implemented in an IED (locked)': {
			sourceXml,
			targetXml,
			// bind the instance LNode to the present IED with a distinct identity + vendor lnType
			mutateTarget: async (tx) => {
				await bindInstanceLnode(tx, {
					iedName: 'VENDOR_A',
					ldInst: 'LD0',
					prefix: 'AA',
					lnInst: '5',
					lnType: 'VENDOR_CSWI_Type',
				})
			},
			expectedQueries: [
				// reconcile must NOT overwrite any locked-identity attribute nor lnType
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@lnType="VENDOR_CSWI_Type"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@iedName="VENDOR_A"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@ldInst="LD0"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@prefix="AA"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@lnInst="5"]',
			],
			unexpectedQueries: [
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@lnType="CSWI_Type"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@iedName="None"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@lnInst="1"]',
			],
		},

		'keeps the identity of a bound LNode whose IED is absent (orphan → still locked)': {
			sourceXml,
			targetXml,
			// bind to an IED that is NOT present in the target: an orphaned binding is
			// still locked, so reconcile must leave it for cleanup to unlock, not reset it.
			mutateTarget: async (tx) => {
				await bindInstanceLnode(tx, {
					iedName: 'GHOST',
					ldInst: 'LD9',
					lnInst: '7',
					lnType: 'GHOST_Type',
				})
			},
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@iedName="GHOST"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@lnInst="7"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@lnType="GHOST_Type"]',
			],
			unexpectedQueries: [
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@iedName="None"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@lnType="CSWI_Type"]',
			],
		},

		'updates the lnType of an unbound LNode (unlocked → template wins)': {
			sourceXml,
			targetXml,
			// keep iedName="None" but pre-set a stale lnType; reconcile should overwrite it
			mutateTarget: async (tx) => {
				await bindInstanceLnode(tx, { lnType: 'STALE_Type' })
			},
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@lnType="CSWI_Type"]',
			],
			unexpectedQueries: [
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"][@lnType="STALE_Type"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		if (testCase.mutateTarget) {
			await target.transaction(testCase.mutateTarget)
		}
		await target.transaction(async (tx) => {
			await updateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
