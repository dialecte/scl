import { beforeCommit } from './before-commit'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import {
	ALL_XMLNS_NAMESPACES,
	assertExpectedElementQueries,
	assertUnexpectedElementQueries,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestRecord,
	runSclTestCases,
} from '@/v2019C1/test'

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

describe('the commit refuses to leave a child behind', () => {
	const sourceXml = /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<Function ${id}="function" name="F1">
					<LNode ${id}="lnode" iedName="None" lnClass="XCBR" lnInst="1" />
				</Function>
			</Substation>
		</SCL>
	`

	// a transaction cannot reach this alone (core stages the subtree of a delete): the log is the one of a hook that
	// staged a bare delete
	runSclTestCases.withoutExport({
		testCases: {
			'a log deleting a function, not the logical node it holds → refused, naming both': {
				sourceXml,
			},
		},
		act: async ({ source }) => {
			const bareDelete: Scl.Operation = {
				status: 'deleted',
				oldRecord: createSclTestRecord({
					record: {
						tagName: 'Function',
						id: 'function',
						parent: { tagName: 'Substation', id: 'substation' },
						children: [{ tagName: 'LNode', id: 'lnode' }],
					},
				}),
				newRecord: undefined,
			}
			const refusal = await beforeCommit({ operations: [bareDelete], query: source.query }).catch(
				(error: unknown) => toDialecteError(error),
			)
			expect(refusal).toMatchObject({
				key: 'CHILD_LEFT_BEHIND',
				meta: {
					record: { tagName: 'Function', id: 'function' },
					child: { tagName: 'LNode', id: 'lnode' },
				},
			})
		},
	})
})

// One commit, both passes: the naming of the LNode the transaction created, and the type its old LNode left unused.
describe('the commit writes the naming and removes the type a replaced LNode left unused', () => {
	const sourceXml = /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<VoltageLevel name="V1" ${id}="voltage-level"><Bay name="B1" ${id}="bay"/></VoltageLevel>
				<Function ${id}="function" name="F1">
					<LNode ${id}="old-lnode" iedName="None" lnClass="XCBR" lnInst="1" lnType="T" />
				</Function>
			</Substation>
			<DataTypeTemplates ${id}="dtt">
				<LNodeType ${id}="lnt-T" id="T" lnClass="XCBR">
					<DO ${id}="do-T" name="Beh" type="D" />
				</LNodeType>
				<LNodeType ${id}="lnt-S" id="S" lnClass="XCBR">
					<DO ${id}="do-S" name="Beh" type="DS" />
				</LNodeType>
				<DOType ${id}="dot-D" id="D" cdc="SPS" />
				<DOType ${id}="dot-DS" id="DS" cdc="SPS" />
			</DataTypeTemplates>
		</SCL>
	`

	runSclTestCases.withExport({
		testCases: {
			'a new LNode created and the old one deleted in one transaction → the new one has its naming, the old type is gone':
				{
					sourceXml,
				},
		},
		act: async ({ source }) => {
			await source.transaction(async function replaceTheLNode(tx) {
				await tx.addChild(
					{ tagName: 'Function', id: 'function' },
					{
						tagName: 'LNode',
						attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '2', lnType: 'S' },
					},
				)
				await tx.delete({ tagName: 'LNode', id: 'old-lnode' })
			})
			const xml = (await source.query.getSnapshot({ as: 'xml' })) as string
			expect(() =>
				assertExpectedElementQueries({
					xml,
					queries: [
						'//default:LNode[@lnType="S"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLnClass="XCBR"][@sLnInst="2"]',
						'//default:LNodeType[@id="S"]',
					],
				}),
			).not.toThrow()
			expect(() =>
				assertUnexpectedElementQueries({
					xml,
					queries: ['//default:LNodeType[@id="T"]', '//default:DOType[@id="D"]'],
				}),
			).not.toThrow()
			return { assertOn: 'source' }
		},
	})
})
