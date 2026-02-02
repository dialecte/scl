import { SCL_DIALECTE_CONFIG } from '../config/dialecte.config'
import { afterCreated } from './after-created'

import {
	createTestDialecte,
	DEV_ID,
	XMLNS_DEFAULT_NAMESPACE,
	XMLNS_DEV_NAMESPACE,
	toRawRecord,
	executeChainOperations,
} from '@dialecte/core'
import { describe, it, expect } from 'vitest'

import type { Scl } from '../config'
import type * as Core from '@dialecte/core'
import type { Chain, ChainTestOperation } from '@dialecte/core'

const xmlString = /* xml */ `
	<SCL ${XMLNS_DEFAULT_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="root">
		<Substation ${DEV_ID}="sub1" name="Sub1">
			<Function ${DEV_ID}="f1" name="F1">
				<LNode ${DEV_ID}="ln1" lnClass="XCBR" />
			</Function>
		</Substation>
	</SCL>
`

describe('afterCreated', () => {
	type TestConfig = Scl.Config

	type TestCase = {
		description: string
		operations?: Array<
			ChainTestOperation<Scl.Config, Scl.ElementsOf, Scl.ChildrenOf<Scl.ElementsOf>>
		>
		testChild?: Core.AnyRawRecord
		testParent?: Core.AnyRawRecord
		stagedPrivateRecord?: Scl.RawRecord<'Private'>
		childSelector: Core.FromElementParams<Scl.Config, Scl.ElementsOf>
		parentSelector: Core.FromElementParams<Scl.Config, Scl.ElementsOf>
		expected: {
			operationsCount: number
			operations: Array<{
				status: 'created' | 'updated'
				oldRecord?: Partial<Core.AnyRawRecord>
				newRecord?: Partial<Core.AnyRawRecord>
			}>
		}
	}

	const testCases: TestCase[] = [
		{
			description: 'returns empty array for element with default namespace',
			childSelector: { tagName: 'Function', id: 'f1' },
			parentSelector: { tagName: 'Substation', id: 'sub1' },
			expected: {
				operationsCount: 0,
				operations: [],
			},
		},
		{
			description: 'creates new Private element for non-default namespace child',
			childSelector: { tagName: 'LNode', id: 'ln1' },
			parentSelector: { tagName: 'LNode', id: 'ln1' },
			testChild: {
				id: '0-0-0-0-1',
				tagName: 'LNodeSpecNaming',
				attributes: [{ name: 'sIedName', value: 'LN1' }],
				namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
				value: '',
				children: [],
				parent: { tagName: 'LNode' as const, id: 'ln1' },
			} satisfies Scl.RawRecord<'LNodeSpecNaming'>,
			expected: {
				operationsCount: 3,
				operations: [
					{
						status: 'created',
						newRecord: {
							tagName: 'Private',
							attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
							parent: { tagName: 'LNode', id: 'ln1' },
							children: [{ tagName: 'LNodeSpecNaming', id: '0-0-0-0-1' }],
						},
					},
					{
						status: 'updated',
						newRecord: {
							tagName: 'LNodeSpecNaming',
						},
					},
					{
						status: 'updated',
						newRecord: {
							tagName: 'LNode',
						},
					},
				],
			},
		},
		{
			description: 'adds child directly to existing Private parent',
			childSelector: { tagName: 'LNode', id: 'ln1' },
			parentSelector: { tagName: 'LNode', id: 'ln1' },
			testChild: {
				id: '0-0-0-0-3',
				tagName: 'LNodeSpecNaming' as const,
				attributes: [{ name: 'sIedName', value: 'LN1' }],
				namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
				value: '',
				children: [],
				parent: null,
			} satisfies Scl.RawRecord<'LNodeSpecNaming'>,
			testParent: {
				id: '0-0-0-0-2',
				tagName: 'Private' as const,
				attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
				namespace: SCL_DIALECTE_CONFIG.namespaces.default,
				value: '',
				children: [],
				parent: { tagName: 'LNode' as const, id: 'ln1' },
			} satisfies Scl.RawRecord<'Private'>,
			expected: {
				operationsCount: 2,
				operations: [
					{
						status: 'updated',
						newRecord: {
							tagName: 'LNodeSpecNaming',
						},
					},
					{
						status: 'updated',
						newRecord: {
							tagName: 'Private',
							children: [{ tagName: 'LNodeSpecNaming', id: '0-0-0-0-3' }],
						},
					},
				],
			},
		},
		{
			description: 'returns empty array when child already has Private parent (cloning scenario)',
			operations: [
				{
					type: 'addChild',
					goTo: { tagName: 'LNode', id: 'ln1' },
					id: '0-0-0-0-4',
					tagName: 'Private',
					attributes: { type: 'eIEC61850-6-100' },
					setFocus: true,
				},
				{
					type: 'addChild',
					id: '0-0-0-0-5',
					tagName: 'LNodeSpecNaming',
					attributes: { name: 'LN1' },
					namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
					setFocus: true,
				},
			],
			childSelector: { tagName: 'LNodeSpecNaming', id: '0-0-0-0-5' },
			parentSelector: { tagName: 'Private', id: '0-0-0-0-4' },
			expected: {
				operationsCount: 0,
				operations: [],
			},
		},
		{
			description: 'reuses existing Private with matching type attribute',
			childSelector: { tagName: 'LNode', id: 'ln1' },
			parentSelector: { tagName: 'LNode', id: 'ln1' },
			testChild: {
				id: '0-0-0-0-8',
				tagName: 'LNodeSpecNaming' as const,
				attributes: [{ name: 'sIedName', value: 'LN2' }],
				namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
				value: '',
				children: [],
				parent: { tagName: 'LNode' as const, id: 'ln1' },
			} satisfies Scl.RawRecord<'LNodeSpecNaming'>,
			testParent: {
				id: 'ln1',
				tagName: 'LNode' as const,
				attributes: [{ name: 'lnClass', value: 'XCBR' }],
				namespace: SCL_DIALECTE_CONFIG.namespaces.default,
				value: '',
				children: [{ tagName: 'Private' as const, id: '0-0-0-0-6' }],
				parent: { tagName: 'Function' as const, id: 'f1' },
			} satisfies Scl.RawRecord<'LNode'>,
			stagedPrivateRecord: {
				id: '0-0-0-0-6',
				tagName: 'Private' as const,
				attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
				namespace: SCL_DIALECTE_CONFIG.namespaces.default,
				value: '',
				children: [{ tagName: 'LNodeSpecNaming' as const, id: '0-0-0-0-7' }] as any,
				parent: { tagName: 'LNode' as const, id: 'ln1' },
			} satisfies Scl.RawRecord<'Private'>,
			expected: {
				operationsCount: 2,
				operations: [
					{
						status: 'updated',
						newRecord: {
							tagName: 'LNodeSpecNaming',
						},
					},
					{
						status: 'updated',
						newRecord: {
							tagName: 'Private',
							children: [
								{ tagName: 'LNodeSpecNaming', id: '0-0-0-0-7' },
								{ tagName: 'LNodeSpecNaming', id: '0-0-0-0-8' },
							],
						},
					},
				],
			},
		},
	]

	testCases.forEach(testAfterCreated)

	function testAfterCreated(testCase: TestCase) {
		it(testCase.description, async () => {
			// Arrange
			const { dialecte, cleanup } = await createTestDialecte<TestConfig>({
				xmlString,
				dialecteConfig: SCL_DIALECTE_CONFIG,
			})

			try {
				// Execute setup operations if any
				if (testCase.operations) {
					await executeChainOperations({
						chain: dialecte.fromRoot() as Chain<TestConfig, Scl.ElementsOf>,
						operations: testCase.operations,
					})
				}

				const childChain = dialecte.fromElement(testCase.childSelector)
				const childRecord =
					testCase.testChild || toRawRecord((await childChain.getContext()).currentFocus)

				const parentChain = dialecte.fromElement(testCase.parentSelector)
				const parentRecord =
					testCase.testParent || toRawRecord((await parentChain.getContext()).currentFocus)

				const context = await parentChain.getContext()

				// Add staged record if provided
				if (testCase.stagedPrivateRecord) {
					context.stagedOperations.push({
						status: 'created',
						oldRecord: undefined,
						newRecord: testCase.stagedPrivateRecord as Scl.RawRecord<Scl.ElementsOf>,
					})
				}

				// Act
				const result = afterCreated({
					childRecord: childRecord as Scl.RawRecord<Scl.ElementsOf>,
					parentRecord: parentRecord as Scl.RawRecord<Scl.ParentsOf<Scl.ElementsOf>>,
					context: context as Scl.Context<Scl.ParentsOf<Scl.ElementsOf>>,
				})

				// Assert
				expect(result.length).toBe(testCase.expected.operationsCount)

				testCase.expected.operations.forEach((expectedOp, index) => {
					const actualOp = result[index]

					expect(actualOp.status).toBe(expectedOp.status)

					if (expectedOp.oldRecord) {
						expect(actualOp.oldRecord).toMatchObject(expectedOp.oldRecord)
					}

					if (expectedOp.newRecord && actualOp.newRecord) {
						expect(actualOp.newRecord).toMatchObject(expectedOp.newRecord)
					}
				})
			} finally {
				await cleanup()
			}
		})
	}
})
