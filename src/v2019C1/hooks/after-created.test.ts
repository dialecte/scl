import { SCL_DIALECTE_CONFIG } from '../config/dialecte.config'
import { afterCreated } from './after-created'

import { createTestContext } from '@dialecte/core/test'
import { describe, it, expect } from 'vitest'

import {
	createSclTestDialecte,
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/helpers/test-fixtures'

import type { Scl } from '../config'
import type * as Core from '@dialecte/core'

// Namespace prefixes in XPath queries must match keys in SCL_DIALECTE_CONFIG.namespaces:
//   default:   → http://www.iec.ch/61850/2003/SCL
//   v2019C1:   → http://www.iec.ch/61850/2019/SCL/6-100

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
	// Test the full flow via document.transaction — hook fires automatically.
	// Assertions on the exported XML via XPath.

	describe('via document.transaction', () => {
		type TestCase = {
			desc: string
			xmlString?: string
			act: (document: Core.Document<Scl.Config>) => Promise<void>
			expectedQueries: string[]
			unexpectedQueries?: string[]
		}

		const testCases: TestCase[] = [
			{
				desc: 'default namespace child is placed directly under parent — no Private wrapping',
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
			{
				desc: 'non-default namespace child is wrapped in a new Private element',
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.addChild(
							{ tagName: 'LNode', id: 'ln1' },
							{
								tagName: 'LNodeSpecNaming',
								namespace: v2019C1,
								attributes: { sIedName: 'IED1' },
							},
						)
					})
				},
				expectedQueries: [
					'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sIedName="IED1"]',
				],
				unexpectedQueries: ['//default:LNode/v2019C1:LNodeSpecNaming'],
			},
			{
				desc: 'second non-default namespace child reuses the existing Private element',
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.addChild(
							{ tagName: 'LNode', id: 'ln1' },
							{
								tagName: 'LNodeSpecNaming',
								namespace: v2019C1,
								attributes: { sIedName: 'IED1' },
							},
						)
						await tx.addChild(
							{ tagName: 'LNode', id: 'ln1' },
							{
								tagName: 'LNodeSpecNaming',
								namespace: v2019C1,
								attributes: { sIedName: 'IED2' },
							},
						)
					})
				},
				expectedQueries: [
					'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sIedName="IED1"]',
					'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sIedName="IED2"]',
				],
				unexpectedQueries: ['//default:LNode/default:Private[2]'],
			},
		]

		it.each(testCases)('$desc', async ({ xmlString, act, expectedQueries, unexpectedQueries }) => {
			const {
				document,
				cleanup,
				exportCurrentTest,
				assertExpectedElementQueries,
				assertUnexpectedElementQueries,
			} = await createSclTestDialecte({ xmlString: xmlString ?? baseXml })

			try {
				await act(document as Core.Document<Scl.Config>)
				const { xmlDocument } = await exportCurrentTest()
				assertExpectedElementQueries({ xmlDocument, queries: expectedQueries })
				if (unexpectedQueries) {
					assertUnexpectedElementQueries({ xmlDocument, queries: unexpectedQueries })
				}
			} finally {
				await cleanup()
			}
		})
	})

	// ── Group 2: Direct hook call ────────────────────────────────────────────
	// Test edge cases where the parent is already a Private element.
	// Operations are inspected directly rather than committing to DB.

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
			desc: string
			childParentId: string | null
			expected: {
				operationCount: number
				operations: Array<{
					status: Core.OperationStatus
					newRecord?: Partial<Core.AnyRawRecord>
				}>
			}
		}

		const testCases: TestCase[] = [
			{
				desc: 'adds child to Private parent when child has no existing parent',
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
			{
				desc: 'returns empty array when child parent is already set to Private (cloning scenario)',
				childParentId: 'priv1',
				expected: { operationCount: 0, operations: [] },
			},
		]

		it.each(testCases)('$desc', async ({ childParentId, expected }) => {
			const { document, databaseName, cleanup } = await createSclTestDialecte({
				xmlString: xmlWithPrivate,
			})

			try {
				const privateRecord = await document.query.getRecord({
					tagName: 'Private',
					id: 'priv1',
				})
				expect(privateRecord).toBeDefined()
				if (!privateRecord) return

				const context = createTestContext({ databaseName, dialecteConfig: SCL_DIALECTE_CONFIG })

				// The type system is not considering Private at all : all element are promoted up
				const result = await afterCreated({
					childRecord: buildLnodeSpecNaming(childParentId) as any,
					parentRecord: privateRecord as any,
					context,
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
})
