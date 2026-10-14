import { describe, expect, it } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { resolveReferencePath } from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const v2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

/** A breaker LNode specified as XCBR1, bound to the IED's Q0XCBR2; a controller LNode beside it. */
const boundBreakerXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="breaker" uuid="breaker-uuid" iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2">
					<Private ${id}="breaker-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="breaker-naming" sLnClass="XCBR" sLnInst="1" />
					</Private>
				</LNode>
				<LNode ${id}="controller" uuid="controller-uuid" iedName="None" lnClass="CSWI" lnInst="1">
					<Private ${id}="controller-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="controller-naming" sLnClass="CSWI" sLnInst="1" />
					</Private>
				</LNode>
			</Function>
		</Substation>
	</SCL>
`

/** The bound breaker, and a controller whose ControlRef controls its Pos. */
const controlledBreakerXml = boundBreakerXml.replace(
	`<eIEC61850-6-100:LNodeSpecNaming ${id}="controller-naming" sLnClass="CSWI" sLnInst="1" />`,
	`<eIEC61850-6-100:LNodeSpecNaming ${id}="controller-naming" sLnClass="CSWI" sLnInst="1" />
	<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
		<eIEC61850-6-100:ControlRef ${id}="control-ref" output="Oper" controlled="S1/F1/XCBR1.Pos" controlledLNodeUuid="breaker-uuid" controlledDoName="Pos" />
	</eIEC61850-6-100:LNodeOutputs>`,
)

describe('an LNode is named in paths by its specified naming', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a ControlRef to a bound LNode is created -> its path names the LNode as specified': {
			sourceXml: boundBreakerXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'LNode', id: 'controller' },
						{ tagName: 'LNodeOutputs', namespace: v2019C1, attributes: {} },
					)
					const outputs = await tx.getChild({ tagName: 'LNode', id: 'controller' }, 'LNodeOutputs')
					if (!outputs) throw new Error('no LNodeOutputs')
					await tx.addChild(outputs, {
						tagName: 'ControlRef',
						namespace: v2019C1,
						attributes: {
							output: 'Oper',
							controlledLNodeUuid: 'breaker-uuid',
							controlledDoName: 'Pos',
						},
					})
				})
			},
			expectedQueries: ['//v2019C1:ControlRef[@controlled="S1/F1/XCBR1.Pos"]'],
			unexpectedQueries: ['//v2019C1:ControlRef[@controlled="S1/F1/Q0XCBR2.Pos"]'],
		},
		'an LNode is bound to an IED -> the paths through it keep its specified name': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED ${id}="ied" name="P1">
						<AccessPoint ${id}="access-point" name="AP1">
							<Server ${id}="server">
								<LDevice ${id}="ldevice" inst="LD0">
									<LN ${id}="ln" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="ln-uuid" />
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="breaker" uuid="breaker-uuid" iedName="None" lnClass="XCBR" lnInst="1">
								<Private ${id}="breaker-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming ${id}="breaker-naming" sLnClass="XCBR" sLnInst="1" />
								</Private>
							</LNode>
							<LNode ${id}="controller" uuid="controller-uuid" iedName="None" lnClass="CSWI" lnInst="1">
								<Private ${id}="controller-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming ${id}="controller-naming" sLnClass="CSWI" sLnInst="1" />
									<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
										<eIEC61850-6-100:ControlRef ${id}="control-ref" output="Oper" controlled="S1/F1/XCBR1.Pos" controlledLNodeUuid="breaker-uuid" controlledDoName="Pos" />
									</eIEC61850-6-100:LNodeOutputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'LNode', id: 'breaker' },
						{ attributes: { lnUuid: 'ln-uuid' } },
					)
				})
			},
			expectedQueries: [
				'//default:LNode[@iedName="P1"][@prefix="Q0"][@lnInst="2"]',
				'//v2019C1:ControlRef[@controlled="S1/F1/XCBR1.Pos"]',
			],
		},
		'the specified naming of an LNode is edited -> the paths through it follow': {
			sourceXml: controlledBreakerXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'LNodeSpecNaming', id: 'breaker-naming' },
						{ attributes: { sLnInst: '3' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:ControlRef[@controlled="S1/F1/XCBR3.Pos"]'],
		},
		'the specified naming of an LNode is removed -> the paths through it name it by its own naming':
			{
				sourceXml: controlledBreakerXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'LNodeSpecNaming', id: 'breaker-naming' })
					})
				},
				expectedQueries: ['//v2019C1:ControlRef[@controlled="S1/F1/Q0XCBR2.Pos"]'],
			},
		'an LNode is given another specified naming -> the paths through it follow': {
			sourceXml: controlledBreakerXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'LNodeSpecNaming', id: 'breaker-naming' })
					await tx.addChild(
						{ tagName: 'LNode', id: 'breaker' },
						{
							tagName: 'LNodeSpecNaming',
							namespace: v2019C1,
							attributes: { sLnClass: 'XCBR', sLnInst: '5' },
						},
					)
				})
			},
			expectedQueries: ['//v2019C1:ControlRef[@controlled="S1/F1/XCBR5.Pos"]'],
		},
		'an LNode assigned to no IED is renamed -> its LNodeSpecNaming and the paths through it follow':
			{
				sourceXml: controlledBreakerXml.replace(
					'iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2"',
					'iedName="None" lnClass="XCBR" lnInst="1"',
				),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'LNode', id: 'breaker' }, { attributes: { lnInst: '6' } })
					})
				},
				expectedQueries: [
					'//default:LNode[@lnInst="6"]//v2019C1:LNodeSpecNaming[@sLnClass="XCBR"][@sLnInst="6"]',
					'//v2019C1:ControlRef[@controlled="S1/F1/XCBR6.Pos"]',
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

describe('a path naming an LNode by its specified naming resolves', () => {
	it('a ControlRef holding only "S1/F1/XCBR1.Pos" -> the bound breaker, qualifier Pos', async () => {
		const { project, source } = await createSclTestProject({ sourceXml: boundBreakerXml })
		try {
			await source.document.transaction(async (tx) => {
				const outputs = await tx.addChild(
					{ tagName: 'LNode', id: 'controller' },
					{ tagName: 'LNodeOutputs', namespace: v2019C1, attributes: {} },
				)
				const controlRef = await tx.addChild(outputs, {
					tagName: 'ControlRef',
					namespace: v2019C1,
					attributes: { output: 'Oper', controlled: 'S1/F1/XCBR1.Pos' },
				})
				const resolved = await resolveReferencePath(tx, controlRef as never, 'controlled')
				expect(resolved?.record.id).toBe('breaker')
				expect(resolved?.qualifier).toBe('Pos')
			})
		} finally {
			await project.destroy()
		}
	})
})
