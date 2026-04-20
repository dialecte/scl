import { afterCreated } from './after-created'

import { describe, it, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestDialecte,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const v2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

const baseXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="sub1" name="Sub1">
			<Function ${id}="f1" name="F1">
				<LNode ${id}="ln1" lnClass="XCBR" />
			</Function>
		</Substation>
	</SCL>
`

const xmlWithPrivate = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="sub1" name="Sub1">
			<Function ${id}="f1" name="F1">
				<LNode ${id}="ln1" lnClass="XCBR">
					<Private ${id}="priv1" type="eIEC61850-6-100" />
				</LNode>
			</Function>
		</Substation>
	</SCL>
`

describe('afterCreated', () => {
	// ── Group 1: Integration ─────────────────────────────────────────────────
	// Full flow via document.transaction — hook fires automatically.
	// Assertions on exported XML via XPath.

	describe('via document.transaction', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			act: (document: Core.Document<Config>) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			'default namespace child → placed directly under parent, no Private wrapping': {
				sourceXml: baseXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.addChild(
							{ tagName: 'Substation', id: 'sub1' },
							{ tagName: 'Function', attributes: { name: 'NewF' } },
						)
					})
				},
				expectedQueries: ['//default:Substation[@name="Sub1"]/default:Function[@name="NewF"]'],
				unexpectedQueries: ['//default:Substation/default:Private'],
			},
			'non-default namespace child → wrapped in new Private element': {
				sourceXml: baseXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.addChild(
							{ tagName: 'LNode', id: 'ln1' },
							{ tagName: 'LNodeSpecNaming', namespace: v2019C1, attributes: { sIedName: 'IED1' } },
						)
					})
				},
				expectedQueries: [
					'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sIedName="IED1"]',
				],
				unexpectedQueries: ['//default:LNode/v2019C1:LNodeSpecNaming'],
			},
			'second non-default namespace child, existing Private → reuses existing Private': {
				sourceXml: baseXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.addChild(
							{ tagName: 'LNode', id: 'ln1' },
							{ tagName: 'LNodeSpecNaming', namespace: v2019C1, attributes: { sIedName: 'IED1' } },
						)
						await tx.addChild(
							{ tagName: 'LNode', id: 'ln1' },
							{ tagName: 'LNodeSpecNaming', namespace: v2019C1, attributes: { sIedName: 'IED2' } },
						)
					})
				},
				expectedQueries: [
					'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sIedName="IED1"]',
					'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sIedName="IED2"]',
				],
				unexpectedQueries: ['//default:LNode/default:Private[2]'],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source, testCase }) => {
				await testCase.act(source.document as Core.Document<Config>)
				return { assertDatabaseName: source.databaseName }
			},
		})
	})

	// ── Group 2: Direct hook call ────────────────────────────────────────────
	// Edge cases where parent is already a Private element.
	// Operations inspected directly rather than committing to DB.

	describe('direct hook call — parent is Private', () => {
		const buildLnodeSpecNaming = (parentId: string | null): Core.AnyRawRecord => ({
			id: '0-0-0-0-1',
			tagName: 'LNodeSpecNaming',
			namespace: v2019C1,
			attributes: [{ name: 'sIedName', value: 'IED1' }],
			value: '',
			children: [],
			parent: parentId ? { id: parentId, tagName: 'Private' as const } : null,
		})

		type TestCase = {
			childParentId: string | null
			expected: {
				operationCount: number
				operations: Array<{
					status: Core.OperationStatus
					newRecord?: Partial<Core.AnyRawRecord>
				}>
			}
		}

		const testCases: Record<string, TestCase> = {
			'child has no parent → staged under Private, 2 operations': {
				childParentId: null,
				expected: {
					operationCount: 2,
					operations: [
						{
							status: 'updated',
							newRecord: {
								tagName: 'LNodeSpecNaming',
								parent: { tagName: 'Private', id: 'priv1' },
							},
						},
						{
							status: 'updated',
							newRecord: {
								tagName: 'Private',
								children: [{ tagName: 'LNodeSpecNaming', id: '0-0-0-0-1' }],
							},
						},
					],
				},
			},
			'child parent already set to Private → no operations staged (cloning scenario)': {
				childParentId: 'priv1',
				expected: { operationCount: 0, operations: [] },
			},
		}

		it.each(Object.entries(testCases))('%s', async (_, { childParentId, expected }) => {
			const { document, cleanup } = await createSclTestDialecte({
				xmlString: xmlWithPrivate,
			})

			try {
				const privateRecord = await document.query.getRecord({ tagName: 'Private', id: 'priv1' })
				expect(privateRecord).toBeDefined()
				if (!privateRecord) return

				const result = await afterCreated({
					childRecord: buildLnodeSpecNaming(childParentId) as any,
					parentRecord: privateRecord as any,
					query: document.query,
				})

				expect(result).toHaveLength(expected.operationCount)
				expected.operations.forEach((expectedOp, i) => {
					expect(result[i].status).toBe(expectedOp.status)
					if (expectedOp.newRecord) {
						expect(result[i].newRecord).toMatchObject(expectedOp.newRecord)
					}
				})
			} finally {
				await cleanup()
			}
		})
	})

	// ── Group 3: Private ancestor check ─────────────────────────────────────

	describe('via document.transaction — matching Private ancestor', () => {
		const xmlWithPrivateAncestor = /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation ${id}="sub1" name="Sub1">
					<Function ${id}="f1" name="F1">
						<LNode ${id}="ln1" lnClass="TCTR">
							<Private ${id}="priv1" type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming ${id}="lns1" sIedName="PIU" sLdInst="CT_Function" sLnClass="TCTR" sLnInst="1" sPrefix="I01B"/>
								<eIEC61850-6-100:DOS ${id}="dos1" name="AmpSv">
									<eIEC61850-6-100:SDS ${id}="sds1" name="instMag">
										<eIEC61850-6-100:DAS ${id}="das1" name="i"/>
									</eIEC61850-6-100:SDS>
								</eIEC61850-6-100:DOS>
							</Private>
						</LNode>
					</Function>
				</Substation>
			</SCL>
		`

		type TestCase = SclTest.BaseXmlTestCase & {
			act: (document: Core.Document<Config>) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			'v2019C1 element added to LNode with existing matching Private (containing DOS/SDS/DAS) → reuses Private, no second Private':
				{
					sourceXml: xmlWithPrivateAncestor,
					act: async (document) => {
						await document.transaction(async (tx) => {
							await tx.addChild(
								{ tagName: 'SDS', id: 'sds1' },
								{ tagName: 'DAS', attributes: { name: 'newDas' } },
							)
						})
					},
					expectedQueries: [
						'//default:Private[@type="eIEC61850-6-100"]/v2019C1:DOS/v2019C1:SDS/v2019C1:DAS[@name="newDas"]',
					],
					unexpectedQueries: ['//default:LNode/default:Private[2]'],
				},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source, testCase }) => {
				await testCase.act(source.document as Core.Document<Config>)
				return { assertDatabaseName: source.databaseName }
			},
		})
	})
})
