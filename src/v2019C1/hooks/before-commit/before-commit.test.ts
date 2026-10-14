import { describe } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1" />
		</Substation>
	</SCL>
`

const lnodeWithPrivateXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="lnode" iedName="P1" ldInst="LD0" lnClass="PTOC" lnInst="1">
					<Private ${id}="lnode-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="spec-naming" sLnClass="PTOC" sLnInst="7" />
						<eIEC61850-6-100:LNodeInputs ${id}="inputs">
							<eIEC61850-6-100:SourceRef ${id}="source-ref" input="Trip" />
						</eIEC61850-6-100:LNodeInputs>
					</Private>
				</LNode>
			</Function>
			<Function ${id}="other-function" name="F2" />
		</Substation>
	</SCL>
`

describe('an LNode always has its LNodeSpecNaming', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode allocated to no IED is created -> its specified naming is its own naming': {
			sourceXml: functionXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'Function', id: 'function' },
						{
							tagName: 'LNode',
							attributes: {
								iedName: 'None',
								ldInst: 'Prot',
								prefix: 'Main',
								lnClass: 'PTOC',
								lnInst: '2',
							},
						},
					)
				})
			},
			expectedQueries: [
				'//default:LNode[@lnClass="PTOC"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLdInst="Prot"][@sPrefix="Main"][@sLnClass="PTOC"][@sLnInst="2"]',
			],
			unexpectedQueries: ['//v2019C1:LNodeSpecNaming[@sIedName]'],
		},
		'an LNode bound to an IED is created -> only its logical node naming is kept as specified': {
			sourceXml: functionXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'Function', id: 'function' },
						{
							tagName: 'LNode',
							attributes: {
								iedName: 'P1',
								ldInst: 'LD0',
								prefix: 'Main',
								lnClass: 'PTOC',
								lnInst: '2',
							},
						},
					)
				})
			},
			expectedQueries: [
				'//default:LNode[@iedName="P1"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sPrefix="Main"][@sLnClass="PTOC"][@sLnInst="2"]',
			],
			unexpectedQueries: [
				'//v2019C1:LNodeSpecNaming[@sIedName]',
				'//v2019C1:LNodeSpecNaming[@sLdInst]',
			],
		},
		'an LNode is created, then its LNodeSpecNaming is added -> the one added is kept, alone': {
			sourceXml: functionXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					const lnode = await tx.addChild(
						{ tagName: 'Function', id: 'function' },
						{ tagName: 'LNode', attributes: { iedName: 'None', lnClass: 'PTOC', lnInst: '1' } },
					)
					await tx.addChild(lnode, {
						tagName: 'LNodeSpecNaming',
						namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
						attributes: { sLnClass: 'PTOC', sLnInst: '7' },
					})
				})
			},
			expectedQueries: [
				'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLnInst="7"]',
			],
			unexpectedQueries: [
				'//v2019C1:LNodeSpecNaming[@sLnInst="1"]',
				'//default:LNode/default:Private[2]',
			],
		},
		'an LNode is copied with its LNodeSpecNaming and inputs -> one Private, holding the copied naming and the inputs':
			{
				sourceXml: lnodeWithPrivateXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						const tree = await tx.getTree({ tagName: 'LNode', id: 'lnode' })
						await tx.deepClone(
							{ tagName: 'Function', id: 'other-function' },
							tree as Scl.TreeRecord<'LNode'>,
						)
					})
				},
				expectedQueries: [
					'//default:Function[@name="F2"]/default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLnInst="7"]',
					'//default:Function[@name="F2"]/default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeInputs/v2019C1:SourceRef[@input="Trip"]',
				],
				unexpectedQueries: [
					'//default:Function[@name="F2"]/default:LNode/default:Private[2]',
					'//default:Function[@name="F2"]//v2019C1:LNodeSpecNaming[2]',
					'//default:Function[@name="F2"]//v2019C1:LNodeSpecNaming[@sLnInst="1"]',
				],
			},
		'an LNode without LNodeSpecNaming is copied with its inputs -> one Private, holding the inputs and the naming it gains':
			{
				sourceXml: lnodeWithPrivateXml.replace(/<eIEC61850-6-100:LNodeSpecNaming[^>]*\/>/, ''),
				act: async (document) => {
					await document.transaction(async (tx) => {
						const tree = await tx.getTree({ tagName: 'LNode', id: 'lnode' })
						await tx.deepClone(
							{ tagName: 'Function', id: 'other-function' },
							tree as Scl.TreeRecord<'LNode'>,
						)
					})
				},
				expectedQueries: [
					'//default:Function[@name="F2"]/default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLnClass="PTOC"][@sLnInst="1"]',
					'//default:Function[@name="F2"]/default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeInputs/v2019C1:SourceRef[@input="Trip"]',
				],
				unexpectedQueries: ['//default:Function[@name="F2"]/default:LNode/default:Private[2]'],
			},
		'an LNode that lost its LNodeSpecNaming is bound to an LN -> it gets one from the naming it had before':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED ${id}="ied" name="PIU">
						<AccessPoint ${id}="access-point" name="AP1">
							<Server ${id}="server">
								<LDevice ${id}="ldevice" inst="CTRL">
									<LN ${id}="ln" lnClass="CSWI" inst="2" prefix="CB" lnType="CSWI_0" uuid="ln-uuid" />
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="lnode" iedName="None" lnClass="CSWI" lnInst="1">
								<Private ${id}="lnode-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming ${id}="spec-naming" sLnClass="CSWI" sLnInst="1" />
								</Private>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'LNodeSpecNaming', id: 'spec-naming' })
						await tx.update(
							{ tagName: 'LNode', id: 'lnode' },
							{ attributes: { lnUuid: 'ln-uuid' } },
						)
					})
				},
				expectedQueries: [
					'//default:LNode[@iedName="PIU"][@prefix="CB"][@lnInst="2"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLnClass="CSWI"][@sLnInst="1"]',
				],
				unexpectedQueries: [
					'//v2019C1:LNodeSpecNaming[@sLnInst="2"]',
					'//v2019C1:LNodeSpecNaming[@sPrefix]',
				],
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await testCase.act(source)
			return { assertOn: 'source' }
		},
	})
})
