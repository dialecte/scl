import { executeChainOperations } from '@dialecte/core'
import { assert } from '@dialecte/core'
import { describe, it, expect } from 'vitest'

import { createSclDialecte } from '@/v2019C1/dialecte'
import { ALL_XMLNS_NAMESPACES, DEV_ID } from '@/v2019C1/helpers'
import { importSclFiles } from '@/v2019C1/io'

import type { Scl } from '@/v2019C1/config'
import type { ChainTestOperation } from '@dialecte/core'

const xmlString = /* xml */ `
<SCL ${ALL_XMLNS_NAMESPACES}>
	<Substation name="AA1" ${DEV_ID}="substation-aa1">
		<Function name="CT Function" ${DEV_ID}="function-ct">
			<SubFunction name="PhsA" ${DEV_ID}="subfunction-phsa">
				<LNode iedName="PIU" ldInst="CT_Function" lnClass="TCTR" lnInst="1" ${DEV_ID}="lnode-phsa">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming sIedName="PIU" sLdInst="CT_Function"
							sLnClass="TCTR" sLnInst="1" sPrefix="I01A" />
					</Private>
				</LNode>
			</SubFunction>
			<SubFunction name="PhsB" ${DEV_ID}="subfunction-phsb">
				<LNode iedName="PIU" ldInst="CT_Function" lnClass="TCTR" lnInst="2" ${DEV_ID}="lnode-phsb" />
			</SubFunction>
			<LNode iedName="PIU" ldInst="CT_Function" lnClass="TCTR" lnInst="4" ${DEV_ID}="lnode-neutral" />
		</Function>
	</Substation>
</SCL>
`

describe('Function', () => {
	describe('extractTo', () => {
		type TestCase = {
			desc: string
			only?: boolean
			operations?: Array<
				ChainTestOperation<Scl.Config, Scl.ElementsOf, Scl.ChildrenOf<Scl.ElementsOf>>
			>
			input: {
				targetExtension: 'FSD' | 'ASD' | 'ISD'
				targetLevel: 'Substation' | 'Bay' | 'VoltageLevel'
			}
			expected: {
				targetHasFunction: boolean
				targetFunctionChildrenCount?: number
				lNodesShouldHaveNoChildren?: boolean
			}
		}

		const extractToTests: TestCase[] = [
			{
				desc: 'extracts Function to FSD at Substation level with LNodes without children',
				input: {
					targetExtension: 'FSD',
					targetLevel: 'Substation',
				},
				expected: {
					targetHasFunction: true,
					targetFunctionChildrenCount: 3,
					lNodesShouldHaveNoChildren: true,
				},
			},
			{
				desc: 'includes LNode with children when extracting to ASD at Substation level',
				input: {
					targetExtension: 'ASD',
					targetLevel: 'Substation',
				},
				expected: {
					targetHasFunction: true,
					targetFunctionChildrenCount: 3,
					lNodesShouldHaveNoChildren: false,
				},
			},
		]

		let testCases = extractToTests
		const runOnlyTestCases = extractToTests.filter((tc) => tc.only)
		if (runOnlyTestCases.length) {
			testCases = runOnlyTestCases
		}

		testCases.forEach(testExtractTo)

		function testExtractTo(tc: TestCase) {
			it(tc.desc, async () => {
				// Arrange
				const sclFile = new File([xmlString], `source-${crypto.randomUUID()}.scd`, {
					type: 'text/xml',
				})
				const [databaseName] = await importSclFiles({ files: [sclFile], useCustomRecordsIds: true })

				const sourceDialecte = await createSclDialecte({ databaseName })
				const targetDialecte = await createSclDialecte({
					databaseName: `target-${crypto.randomUUID()}`,
				})

				if (tc.operations) {
					await executeChainOperations({
						chain: sourceDialecte.fromRoot(),
						operations: tc.operations,
					})
				}

				// Act
				const { target } = await sourceDialecte
					.fromElement({ tagName: 'Function', id: 'function-ct' })
					.extractTo({
						target: {
							extension: tc.input.targetExtension,
							chain: targetDialecte.fromRoot(),
							level: tc.input.targetLevel,
						},
					})

				await target.commit()

				// Assert
				const targetRoot = await targetDialecte
					.fromRoot()
					.findDescendants({ filter: { tagName: tc.input.targetLevel } })

				// Check Function is at the correct level
				const levelElement = targetRoot?.[tc.input.targetLevel]?.[0]
				expect(levelElement).toBeDefined()

				const targetFunctions = await targetDialecte
					.fromElement({ tagName: tc.input.targetLevel, id: levelElement!.id })
					.findDescendants({ filter: { tagName: 'Function' } })

				if (tc.expected.targetHasFunction) {
					expect(targetFunctions?.Function).toBeDefined()
					expect(targetFunctions?.Function).toHaveLength(1)
					const targetFunction = targetFunctions!.Function?.[0]

					assert(targetFunction, 'Target Function should be defined')

					// Check LNode children handling
					if (tc.expected.lNodesShouldHaveNoChildren !== undefined) {
						const targetFunctionTree = await targetDialecte
							.fromElement({ tagName: 'Function', id: targetFunction.id })
							.getTree()

						const { LNode: lNodes = [] } = await targetDialecte
							.fromRoot()
							.findDescendants({ filter: { tagName: 'LNode' } })

						if (tc.expected.lNodesShouldHaveNoChildren) {
							// FSD: LNodes should be cloned but with no children
							expect(lNodes.length).toBeGreaterThan(0)
							for (const lNode of lNodes) {
								expect(lNode.children).toHaveLength(0)
							}
						} else {
							// ASD: LNodes should include children if they exist
							const lNodesWithChildren = lNodes.filter((ln) => ln.children.length > 0)
							expect(lNodesWithChildren.length).toBeGreaterThan(0)
						}
					}
				} else {
					expect(targetFunctions?.Function).toBeUndefined()
				}
			})
		}

		function findAllLNodesInTree(tree: any): any[] {
			const lNodes: any[] = []

			if (tree.tagName === 'LNode') {
				lNodes.push(tree)
			}

			if (tree.children && tree.children.length > 0) {
				for (const child of tree.children) {
					lNodes.push(...findAllLNodesInTree(child))
				}
			}

			return lNodes
		}
	})
})
