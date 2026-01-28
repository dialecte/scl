import { describe, it, expect } from 'vitest'

import {
	createSclTestDialecte,
	XMLNS_SCL_NAMESPACE,
	XMLNS_SCL_6_100_NAMESPACE,
	XMLNS_DEV_NAMESPACE,
	DEV_ID,
} from '../test-fixtures'

import { getOrCreateSubstationSectionRequiredStructure } from './create-substation-section-required-structure'

describe('getOrCreateSubstationSectionRequiredStructure', () => {
	type FocusLevel = 'SCL' | 'Substation' | 'VoltageLevel' | 'Bay'

	type TestCase = {
		desc: string
		only?: boolean
		xmlString: string
		params: {
			focusLevel: FocusLevel
			names?: {
				substation?: string
				voltageLevel?: string
				bay?: string
			}
		}
		expected: {
			focusTag: FocusLevel
			focusName: string
			parentTag?: 'SCL' | 'Substation' | 'VoltageLevel'
			childrenCount: number
		}
	}

	const testCases: TestCase[] = [
		// Create from empty SCL
		{
			desc: 'creates full hierarchy focusing on Bay when SCL is empty',
			xmlString: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1"></SCL>`,
			params: { focusLevel: 'Bay' },
			expected: {
				focusTag: 'Bay',
				focusName: 'TEMPLATE',
				parentTag: 'VoltageLevel',
				childrenCount: 0,
			},
		},
		{
			desc: 'creates full hierarchy focusing on VoltageLevel when SCL is empty',
			xmlString: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1"></SCL>`,
			params: { focusLevel: 'VoltageLevel' },
			expected: {
				focusTag: 'VoltageLevel',
				focusName: 'TEMPLATE',
				parentTag: 'Substation',
				childrenCount: 1, // Bay was created
			},
		},
		{
			desc: 'creates full hierarchy focusing on Substation when SCL is empty',
			xmlString: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1"></SCL>`,
			params: { focusLevel: 'Substation' },
			expected: {
				focusTag: 'Substation',
				focusName: 'TEMPLATE',
				parentTag: 'SCL',
				childrenCount: 1, // VoltageLevel was created
			},
		},

		// Find existing and create missing
		{
			desc: 'finds existing Substation and creates missing VL and Bay',
			xmlString: /* xml */ `
				<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1">
					<Substation ${DEV_ID}="2" name="TEMPLATE" />
				</SCL>
			`,
			params: { focusLevel: 'Bay' },
			expected: {
				focusTag: 'Bay',
				focusName: 'TEMPLATE',
				parentTag: 'VoltageLevel',
				childrenCount: 0,
			},
		},
		{
			desc: 'finds existing Sub and VL, creates Bay, focuses on VoltageLevel',
			xmlString: /* xml */ `
				<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1">
					<Substation ${DEV_ID}="2" name="TEMPLATE">
						<VoltageLevel ${DEV_ID}="3" name="TEMPLATE" />
					</Substation>
				</SCL>
			`,
			params: { focusLevel: 'VoltageLevel' },
			expected: {
				focusTag: 'VoltageLevel',
				focusName: 'TEMPLATE',
				parentTag: 'Substation',
				childrenCount: 1, // Bay created
			},
		},
		{
			desc: 'finds complete hierarchy and focuses on Substation',
			xmlString: /* xml */ `
				<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1">
					<Substation ${DEV_ID}="2" name="TEMPLATE">
						<VoltageLevel ${DEV_ID}="3" name="TEMPLATE">
							<Bay ${DEV_ID}="4" name="TEMPLATE" />
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			params: { focusLevel: 'Substation' },
			expected: {
				focusTag: 'Substation',
				focusName: 'TEMPLATE',
				parentTag: 'SCL',
				childrenCount: 1,
			},
		},

		// Custom names
		{
			desc: 'creates hierarchy with custom names focusing on Bay',
			xmlString: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1"></SCL>`,
			params: {
				focusLevel: 'Bay',
				names: { substation: 'SUB1', voltageLevel: 'VL1', bay: 'BAY1' },
			},
			expected: {
				focusTag: 'Bay',
				focusName: 'BAY1',
				parentTag: 'VoltageLevel',
				childrenCount: 0,
			},
		},
		{
			desc: 'finds Substation by custom name, creates VL and Bay with custom names',
			xmlString: /* xml */ `
				<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1">
					<Substation ${DEV_ID}="2" name="SUB1" />
				</SCL>
			`,
			params: {
				focusLevel: 'VoltageLevel',
				names: { substation: 'SUB1', voltageLevel: 'VL1', bay: 'BAY1' },
			},
			expected: {
				focusTag: 'VoltageLevel',
				focusName: 'VL1',
				parentTag: 'Substation',
				childrenCount: 1,
			},
		},
	]

	let filteredTests = testCases
	const onlyTests = testCases.filter((tc) => tc.only)
	if (onlyTests.length) {
		filteredTests = onlyTests
	}

	filteredTests.forEach(runTest)

	function runTest(tc: TestCase) {
		it(tc.desc, async () => {
			// Arrange
			const { dialecte } = await createSclTestDialecte({
				xmlString: tc.xmlString,
			})
			const sclChain = dialecte.fromElement({ tagName: 'SCL', id: '1' })

			// Act
			const {
				chain: resultChain,
				substationId,
				voltageLevelId,
				bayId,
			} = await getOrCreateSubstationSectionRequiredStructure({
				chain: sclChain,
				focusLevel: tc.params.focusLevel,
				names: tc.params.names,
			})

			const context = await resultChain.getContext()

			// Assert - Focus is at correct level
			expect(context.currentFocus.tagName).toBe(tc.expected.focusTag)

			// Assert - Focused element has correct name
			const nameAttr = context.currentFocus.attributes.find(
				(attribute) => attribute.name === 'name',
			)
			expect(nameAttr?.value).toBe(tc.expected.focusName)

			// Assert - Parent is correct (if not SCL)
			if (tc.expected.parentTag) {
				expect(context.currentFocus.parent?.tagName).toBe(tc.expected.parentTag)
			}

			// Assert - Children count is correct
			expect(context.currentFocus.children.length).toBe(tc.expected.childrenCount)

			expect(substationId).toBeDefined()
			expect(voltageLevelId).toBeDefined()
			expect(bayId).toBeDefined()
		})
	}
})
