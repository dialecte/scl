import { describe, it, expect } from 'vitest'

import { createSclDialecte } from '@/v2019C1/dialecte'
import { ALL_XMLNS_NAMESPACES, DEV_ID } from '@/v2019C1/helpers'
import { importSclFiles } from '@/v2019C1/io'

import type { Scl } from '@/v2019C1/config'

const xmlString = /* xml */ `
<SCL ${ALL_XMLNS_NAMESPACES}>
	<Substation name="AA1" ${DEV_ID}="substation-aa1">
		<Function name="HMI Function" ${DEV_ID}="function-hmi">
			<SubFunction name="HMI" ${DEV_ID}="subfunction-hmi">
				<Private type="eIEC61850-6-100">
					<eIEC61850-6-100:FunctionSclRef>
						<eIEC61850-6-100:SclFileReference fileUuid="IHMI" fileType="FSD" version="1" revision="0" />
					</eIEC61850-6-100:FunctionSclRef>
				</Private>
				<LNode iedName="HMI" ldInst="HMI_Function" lnClass="IHMI" lnInst="1" ${DEV_ID}="lnode-hmi">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming sIedName="HMI" sLdInst="HMI_Function" sLnClass="IHMI" sLnInst="1" sPrefix="" />
						<eIEC61850-6-100:LNodeInputs>
							<eIEC61850-6-100:SourceRef pDO="Op" pLN="PTOC" pDA="general" input="Operate" inputInst="1" />
						</eIEC61850-6-100:LNodeInputs>
						<eIEC61850-6-100:LNodeOutputs>
							<eIEC61850-6-100:ControlRef desc="" pDO="Mod" pLN="PTOC" output="HMI_Command" outputInst="1" />
						</eIEC61850-6-100:LNodeOutputs>
					</Private>
				</LNode>
			</SubFunction>
		</Function>
	</Substation>
</SCL>
`

describe('Function', () => {
	describe('extractTo', () => {
		type TestCase = {
			description: string
			input: {
				targetExtension: 'FSD' | 'ASD' | 'ISD'
				targetLevel: 'Substation' | 'Bay' | 'VoltageLevel'
			}
			expected: Partial<Record<Scl.DescendantsOf<'Function'>, number>>
		}

		const testCases: TestCase[] = [
			{
				description: 'FSD: filters out specified elements',
				input: {
					targetExtension: 'FSD',
					targetLevel: 'Substation',
				},
				expected: {
					SubFunction: 1,
					LNode: 1,
					LNodeSpecNaming: 1,
				},
			},
		]

		testCases.forEach(testExtractTo)

		function testExtractTo(testCase: TestCase) {
			it(testCase.description, async () => {
				// Arrange
				const sclFile = new File([xmlString], `source-${crypto.randomUUID()}.scd`, {
					type: 'text/xml',
				})
				const [databaseName] = await importSclFiles({ files: [sclFile], useCustomRecordsIds: true })

				const sourceDialecte = await createSclDialecte({ databaseName })
				const targetDialecte = await createSclDialecte({
					databaseName: `target-${crypto.randomUUID()}`,
				})

				// Act
				const { targetChain } = await sourceDialecte
					.fromElement({ tagName: 'Function', id: 'function-hmi' })
					.extractTo({
						target: {
							extension: testCase.input.targetExtension,
							chain: targetDialecte.fromRoot(),
							level: testCase.input.targetLevel,
						},
					})

				await targetChain.commit()

				// Assert
				const { Function: functionRoot } = await targetDialecte.fromRoot().findDescendants()

				// Check Function exists at correct level
				const levelElement = functionRoot[0].parent?.tagName
				expect(levelElement).toBe(testCase.input.targetLevel)

				// Get all descendants from the target level
				const functionDescendants = await targetDialecte.fromRoot().findDescendants()

				for (const [descendantTag, expectedCount] of Object.entries(testCase.expected)) {
					const actualCount =
						functionDescendants[descendantTag as Scl.DescendantsOf<'Function'>]?.length || 0
					expect(
						actualCount,
						`Expected ${expectedCount} ${descendantTag} elements, but found ${actualCount}`,
					).toBe(expectedCount)
				}
			})
		}
	})
})
