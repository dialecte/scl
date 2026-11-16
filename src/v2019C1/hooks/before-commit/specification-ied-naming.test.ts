import { describe } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A function to place LNodes in, a specification IED S1 (no source file) and a real IED R1 (from an ICD file). */
const project = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1" />
		</Substation>
		<IED ${id}="s1" name="S1">
			<AccessPoint ${id}="s1-ap" name="AP1" uuid="s1-ap-uuid">
				<Server ${id}="s1-server">
					<LDevice ${id}="s1-ld" inst="CTRL" uuid="s1-ld-uuid">
						<LN0 ${id}="s1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="s1-lln0-uuid"/>
						<LN ${id}="s1-cswi" prefix="" lnClass="CSWI" inst="1" lnType="CSWI_T" uuid="s1-cswi-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="r1" name="R1">
			<IEDSourceFiles ${id}="r1-source-files">
				<SclFileReference ${id}="r1-icd" fileType="ICD"/>
			</IEDSourceFiles>
			<AccessPoint ${id}="r1-ap" name="AP1" uuid="r1-ap-uuid">
				<Server ${id}="r1-server">
					<LDevice ${id}="r1-ld" inst="LD0" uuid="r1-ld-uuid">
						<LN0 ${id}="r1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="r1-lln0-uuid"/>
						<LN ${id}="r1-cswi" prefix="Q0" lnClass="CSWI" inst="3" lnType="CSWI_T" uuid="r1-cswi-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

const v2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

const KEYREF_TOLERANCE = {
	reason:
		'the logical nodes the act creates name types the document holds no template of, as the fixture IEDs do: the case is the naming',
	violations: [{ check: 'xsd' as const, code: 'keyref' as const }],
}

/**
 * Every case creates, in one transaction, a specification IED BCU1 (its logical node CTRL/CSWI1, uuid
 * `bcu1-cswi-uuid`), then an LNode of F1 with the case's attributes, holding the case's specified naming when it gives
 * one: the way a placement writes an IED and its bound LNodes before the commit.
 */
describe('an LNode created on a specification IED is specified on that IED', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnode: Record<string, string>
		specifiedNaming?: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode bound to the specification IED created with it, carrying the template naming SPECIFICATION -> sIedName names BCU1':
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: {
					iedName: 'BCU1',
					ldInst: 'CTRL',
					prefix: '',
					lnClass: 'CSWI',
					lnInst: '1',
					lnUuid: 'bcu1-cswi-uuid',
				},
				specifiedNaming: {
					sIedName: 'SPECIFICATION',
					sLdInst: 'CTRL',
					sLnClass: 'CSWI',
					sLnInst: '1',
				},
				expectedQueries: [
					'//default:LNode[@iedName="BCU1"]//v2019C1:LNodeSpecNaming[@sIedName="BCU1"][@sLdInst="CTRL"][@sLnClass="CSWI"][@sLnInst="1"]',
				],
				unexpectedQueries: ['//v2019C1:LNodeSpecNaming[@sIedName="SPECIFICATION"]'],
			},

		'an LNode bound to a specification IED is created with no specified naming -> it is specified on that IED':
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: {
					iedName: 'S1',
					ldInst: 'CTRL',
					prefix: '',
					lnClass: 'CSWI',
					lnInst: '1',
					lnUuid: 's1-cswi-uuid',
				},
				expectedQueries: [
					'//default:LNode[@iedName="S1"]//v2019C1:LNodeSpecNaming[@sIedName="S1"][@sLdInst="CTRL"][@sLnClass="CSWI"][@sLnInst="1"]',
				],
			},

		'an LNode bound to the specification IED created with it, its logical device named OLD -> the lnUuid wins, sLdInst CTRL':
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: {
					iedName: 'BCU1',
					ldInst: 'OLD',
					prefix: '',
					lnClass: 'CSWI',
					lnInst: '1',
					lnUuid: 'bcu1-cswi-uuid',
				},
				expectedQueries: [
					'//default:LNode[@iedName="BCU1"][@ldInst="CTRL"]//v2019C1:LNodeSpecNaming[@sIedName="BCU1"][@sLdInst="CTRL"]',
				],
			},

		'an LNode created with an lnUuid naming a logical node of a specification IED and no IED name -> it is specified on that IED':
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: { lnClass: 'CSWI', lnInst: '1', lnUuid: 's1-cswi-uuid' },
				expectedQueries: [
					'//default:LNode[@iedName="S1"]//v2019C1:LNodeSpecNaming[@sIedName="S1"][@sLdInst="CTRL"][@sLnClass="CSWI"][@sLnInst="1"]',
				],
			},

		"an LNode created naming another logical node of the specification IED than its lnUuid names -> its new specified naming is that logical node's":
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: {
					iedName: 'BCU1',
					ldInst: 'CTRL',
					prefix: 'QA',
					lnClass: 'CSWI',
					lnInst: '7',
					lnUuid: 'bcu1-cswi-uuid',
				},
				expectedQueries: [
					'//default:LNode[@iedName="BCU1"][@lnInst="1"]//v2019C1:LNodeSpecNaming[@sIedName="BCU1"][@sLdInst="CTRL"][@sLnClass="CSWI"][@sLnInst="1"][not(@sPrefix)]',
				],
			},

		'an LNode created naming another logical node of a real IED than its lnUuid names -> its new specified naming keeps the names it was created with':
			{
				sourceXml: project,
				allowInvalidOutput: KEYREF_TOLERANCE,
				lnode: {
					iedName: 'R1',
					ldInst: 'LD0',
					prefix: 'QA',
					lnClass: 'CSWI',
					lnInst: '7',
					lnUuid: 'r1-cswi-uuid',
				},
				expectedQueries: [
					'//default:LNode[@iedName="R1"][@prefix="Q0"][@lnInst="3"]//v2019C1:LNodeSpecNaming[@sPrefix="QA"][@sLnClass="CSWI"][@sLnInst="7"]',
				],
				unexpectedQueries: ['//v2019C1:LNodeSpecNaming[@sIedName]'],
			},

		'an LNode bound to a real IED is created with no specified naming -> no IED is specified': {
			sourceXml: project,
			allowInvalidOutput: KEYREF_TOLERANCE,
			lnode: {
				iedName: 'R1',
				ldInst: 'LD0',
				prefix: 'Q0',
				lnClass: 'CSWI',
				lnInst: '3',
				lnUuid: 'r1-cswi-uuid',
			},
			expectedQueries: [
				'//default:LNode[@iedName="R1"]//v2019C1:LNodeSpecNaming[@sPrefix="Q0"][@sLnClass="CSWI"][@sLnInst="3"]',
			],
			unexpectedQueries: [
				'//default:LNode[@iedName="R1"]//v2019C1:LNodeSpecNaming[@sIedName]',
				'//default:LNode[@iedName="R1"]//v2019C1:LNodeSpecNaming[@sLdInst]',
			],
		},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { lnode, specifiedNaming } = testCase
		await source.transaction(async (tx) => {
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
			// an LNode of any naming: the parent ref is widened as for any element the case names
			const functionRef = { tagName: 'Function', id: 'function' } as Scl.Ref<Scl.ElementsOf>
			const created = await tx.addChild(functionRef, { tagName: 'LNode', attributes: lnode })
			if (specifiedNaming)
				await tx.addChild(created, {
					tagName: 'LNodeSpecNaming',
					namespace: v2019C1,
					attributes: specifiedNaming,
				})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
