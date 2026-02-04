import { describe, it, expect } from 'vitest'

import {
	createSclTestDialecte,
	XMLNS_SCL_NAMESPACE,
	XMLNS_SCL_6_100_NAMESPACE,
	XMLNS_DEV_NAMESPACE,
	DEV_ID,
} from '../test-fixtures'

import { getOrCreateSubstationSectionRequiredStructure } from './create-substation-section-required-structure'

import type { Scl } from '@/v2019C1/config'
import type { Chain } from '@dialecte/core'

describe('getOrCreateSubstationSectionRequiredStructure', () => {
	type FocusLevel = 'SCL' | 'Substation' | 'VoltageLevel' | 'Bay'

	type TestCase = {
		desc: string
		xmlString: string
		params: {
			focusLevel: FocusLevel
			names?: {
				substation?: string
				voltageLevel?: string
				bay?: string
			}
		}
	}

	const testCases: TestCase[] = [
		// Create from empty SCL
		{
			desc: 'creates full hierarchy focusing on Bay when SCL is empty',
			xmlString: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1"></SCL>`,
			params: { focusLevel: 'Bay' },
		},
		{
			desc: 'creates full hierarchy focusing on VoltageLevel when SCL is empty',
			xmlString: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1"></SCL>`,
			params: { focusLevel: 'VoltageLevel' },
		},
		{
			desc: 'creates full hierarchy focusing on Substation when SCL is empty',
			xmlString: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1"></SCL>`,
			params: { focusLevel: 'Substation' },
		},

		// Find existing and create missing
		{
			desc: 'finds existing Substation and creates missing VoltageLevel and Bay',
			xmlString: /* xml */ `
				<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1">
					<Substation ${DEV_ID}="2" name="TEMPLATE" />
				</SCL>
			`,
			params: { focusLevel: 'Bay' },
		},
		{
			desc: 'finds existing Substation and VoltageLevel, creates Bay, focuses on VoltageLevel',
			xmlString: /* xml */ `
				<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1">
					<Substation ${DEV_ID}="2" name="TEMPLATE">
						<VoltageLevel ${DEV_ID}="3" name="TEMPLATE" />
					</Substation>
				</SCL>
			`,
			params: { focusLevel: 'VoltageLevel' },
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
		},

		// Custom names
		{
			desc: 'creates hierarchy with custom names focusing on Bay',
			xmlString: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${DEV_ID}="1"></SCL>`,
			params: {
				focusLevel: 'Bay',
				names: { substation: 'SUB1', voltageLevel: 'VL1', bay: 'BAY1' },
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
		},
	]

	testCases.forEach(runTest)

	function runTest(testCase: TestCase) {
		it(testCase.desc, async () => {
			// Arrange
			const { dialecte } = await createSclTestDialecte({
				xmlString: testCase.xmlString,
			})
			const sclChain = dialecte.fromRoot()

			const { focusLevel, names } = testCase.params
			const {
				substation: substationName,
				voltageLevel: voltageLevelName,
				bay: bayName,
			} = names || {}

			// Act
			const {
				chain: resultChain,
				substationId,
				voltageLevelId,
				bayId,
			} = await getOrCreateSubstationSectionRequiredStructure({
				chain: sclChain as Chain<Scl.Config, 'SCL'>,
				focusLevel,
				names,
			})

			await resultChain.commit()

			const {
				Substation: substations,
				VoltageLevel: voltageLevels,
				Bay: bays,
			} = await dialecte.fromRoot().findDescendants()

			// Assert - Check structure

			const { currentFocus: resultChainFocus } = await resultChain.getContext()

			// Focus is correct
			expect(resultChainFocus.tagName).toBe(focusLevel)

			// Full hierarchy created
			expect(substations.length).toBe(1)
			expect(voltageLevels.length).toBe(1)
			expect(bays.length).toBe(1)

			// Names are correct
			expect(substations[0].attributes.find((a) => a.name === 'name')?.value).toBe(
				substationName ?? 'TEMPLATE',
			)
			expect(voltageLevels[0].attributes.find((a) => a.name === 'name')?.value).toBe(
				voltageLevelName ?? 'TEMPLATE',
			)
			expect(bays[0].attributes.find((a) => a.name === 'name')?.value).toBe(bayName ?? 'TEMPLATE')

			expect(substationId).toBeDefined()
			expect(voltageLevelId).toBeDefined()
			expect(bayId).toBeDefined()
		})
	}
})
