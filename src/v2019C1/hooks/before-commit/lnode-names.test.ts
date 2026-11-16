import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * A function to place LNodes in (F1 holds one LNode on no IED, `lnode-free`) and a real IED R1 (from an ICD file)
 * whose logical node LD0/Q0CSWI3 has the uuid `r1-cswi-uuid`; a vendor's Private in LD0 holds a copy VCSWI5 (uuid
 * `vendor-uuid`), vendor payload, no logical node of R1. No IED BCU1 yet: the acts create it.
 */
const project = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="lnode-free" iedName="None" lnClass="CSWI" lnInst="1" uuid="lnode-free-uuid"/>
			</Function>
		</Substation>
		<IED ${id}="r1" name="R1">
			<IEDSourceFiles ${id}="r1-source-files">
				<SclFileReference ${id}="r1-icd" fileType="ICD"/>
			</IEDSourceFiles>
			<AccessPoint ${id}="r1-ap" name="AP1" uuid="r1-ap-uuid">
				<Server ${id}="r1-server">
					<LDevice ${id}="r1-ld" inst="LD0" uuid="r1-ld-uuid">
						<LN0 ${id}="r1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="r1-lln0-uuid"/>
						<LN ${id}="r1-cswi" prefix="Q0" lnClass="CSWI" inst="3" lnType="CSWI_T" uuid="r1-cswi-uuid"/>
						<Private ${id}="r1-vendor" type="vendor">
							<LN ${id}="r1-vendor-ln" prefix="V" lnClass="CSWI" inst="5" lnType="CSWI_T" uuid="vendor-uuid"/>
						</Private>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

const KEYREF_TOLERANCE = {
	reason:
		'the logical nodes the act creates name types the document holds no template of, as the fixture IED does: the case is the naming',
	violations: [{ check: 'xsd' as const, code: 'keyref' as const }],
}

/** Creates IED BCU1 with its logical node CTRL/CSWI1 (uuid `bcu1-cswi-uuid`), as a placement writes it. */
async function createBcu1(params: { tx: Scl.Transaction }): Promise<void> {
	const { tx } = params
	const ied = await tx.addChild(
		{ tagName: 'SCL' },
		{ tagName: 'IED', attributes: { name: 'BCU1', uuid: 'bcu1-uuid' } },
	)
	const accessPoint = await tx.addChild(ied, {
		tagName: 'AccessPoint',
		attributes: { name: 'AP1', uuid: 'bcu1-ap-uuid' },
	})
	const server = await tx.addChild(accessPoint, { tagName: 'Server' })
	await tx.addChild(server, { tagName: 'Authentication' })
	const lDevice = await tx.addChild(server, {
		tagName: 'LDevice',
		attributes: { inst: 'CTRL', uuid: 'bcu1-ld-uuid' },
	})
	await tx.addChild(lDevice, {
		tagName: 'LN0',
		attributes: { lnClass: 'LLN0', inst: '', lnType: 'LLN0_T', uuid: 'bcu1-lln0-uuid' },
	})
	await tx.addChild(lDevice, {
		tagName: 'LN',
		attributes: {
			prefix: '',
			lnClass: 'CSWI',
			inst: '1',
			lnType: 'CSWI_T',
			uuid: 'bcu1-cswi-uuid',
		},
	})
}

/**
 * Every case creates, in one transaction, an LNode of F1 with the case's attributes, then IED BCU1: an LNode may
 * name by `lnUuid` a logical node the transaction writes after it.
 */
describe('an LNode created with an lnUuid is written the names of the logical node it names', () => {
	type TestCase = SclTest.BaseXmlTestCase & { lnode: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		"an LNode created with an lnUuid naming a logical node of the document and no names -> its names are that logical node's":
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: { lnClass: 'CSWI', uuid: 'lnode-new-uuid', lnUuid: 'r1-cswi-uuid' },
				expectedQueries: [
					'//default:LNode[@uuid="lnode-new-uuid"][@iedName="R1"][@ldInst="LD0"][@prefix="Q0"][@lnClass="CSWI"][@lnInst="3"]',
				],
			},

		'an LNode created naming another IED and logical device than the logical node its lnUuid names -> the lnUuid wins':
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: {
					iedName: 'BCU1',
					ldInst: 'OLD',
					lnClass: 'XCBR',
					lnInst: '7',
					uuid: 'lnode-new-uuid',
					lnUuid: 'r1-cswi-uuid',
				},
				expectedQueries: [
					'//default:LNode[@uuid="lnode-new-uuid"][@iedName="R1"][@ldInst="LD0"][@prefix="Q0"][@lnClass="CSWI"][@lnInst="3"]',
				],
			},

		"an LNode created with an lnUuid naming a logical node the transaction creates after it -> its names are that logical node's":
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: {
					iedName: 'SPECIFICATION',
					ldInst: 'CTRL',
					lnClass: 'CSWI',
					lnInst: '1',
					uuid: 'lnode-new-uuid',
					lnUuid: 'bcu1-cswi-uuid',
				},
				expectedQueries: [
					'//default:LNode[@uuid="lnode-new-uuid"][@iedName="BCU1"][@ldInst="CTRL"][@lnClass="CSWI"][@lnInst="1"]',
				],
				unexpectedQueries: ['//default:LNode[@iedName="SPECIFICATION"]'],
			},

		'an LNode created with an lnUuid naming a logical node in vendor payload -> its names are left as written':
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: {
					iedName: 'None',
					lnClass: 'XCBR',
					lnInst: '7',
					uuid: 'lnode-new-uuid',
					lnUuid: 'vendor-uuid',
				},
				expectedQueries: [
					'//default:LNode[@uuid="lnode-new-uuid"][@iedName="None"][@lnClass="XCBR"][@lnInst="7"][not(@ldInst)]',
				],
			},

		'an LNode created with an lnUuid naming no logical node -> its names are left as written': {
			sourceXml: project,
			allowInvalidOutput: {
				reason:
					'the lnUuid names no logical node of the document: the case is that nothing names it',
				violations: [
					{ check: 'xsd', code: 'keyref' },
					{ check: 'references', code: 'dangling' },
				],
			},
			lnode: {
				iedName: 'R1',
				ldInst: 'LD0',
				lnClass: 'XCBR',
				lnInst: '7',
				uuid: 'lnode-new-uuid',
				lnUuid: 'gone-uuid',
			},
			expectedQueries: [
				'//default:LNode[@uuid="lnode-new-uuid"][@iedName="R1"][@ldInst="LD0"][@lnClass="XCBR"][@lnInst="7"]',
			],
		},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async (tx) => {
			const functionRef = { tagName: 'Function', id: 'function' } as Scl.Ref<Scl.ElementsOf>
			await tx.addChild(functionRef, { tagName: 'LNode', attributes: testCase.lnode })
			await createBcu1({ tx })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

/** The case binds `lnode-free` by its `lnUuid` alone, then creates IED BCU1, in one transaction. */
describe('an LNode bound to a logical node the transaction creates after the binding is written its names', () => {
	type TestCase = SclTest.BaseXmlTestCase & { lnUuid: string }

	const testCases: SclTest.TestCases<TestCase> = {
		"an LNode on no IED is bound to a logical node written after the binding -> its names are that logical node's":
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnUuid: 'bcu1-cswi-uuid',
				expectedQueries: [
					'//default:LNode[@uuid="lnode-free-uuid"][@iedName="BCU1"][@ldInst="CTRL"][@lnClass="CSWI"][@lnInst="1"][@lnUuid="bcu1-cswi-uuid"]',
				],
			},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async (tx) => {
			await tx.update(
				{ tagName: 'LNode', id: 'lnode-free' },
				{ attributes: { lnUuid: testCase.lnUuid } },
			)
			await createBcu1({ tx })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
