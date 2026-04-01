import { ensureSubstationTemplateStructure } from './ensure-substation-structure'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

describe('ensureSubstationStructure', () => {
	type TestCase = SclTest.BaseTestCase

	const testCases: SclTest.TestCases<TestCase> = {
		'empty SCL → TEMPLATE Substation/VoltageLevel/Bay created': {
			sourceXml: /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Header id="TestSCL"/></SCL>`,
			expectedQueries: [
				'//default:Substation[@name="TEMPLATE"]/default:VoltageLevel[@name="TEMPLATE"]/default:Bay[@name="TEMPLATE"]',
			],
		},
		'SCL with existing Substation → TEMPLATE structure added alongside': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="ExistingSubstation">
						<VoltageLevel name="ExistingVL">
							<Bay name="ExistingBay"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:Substation[@name="TEMPLATE"]/default:VoltageLevel[@name="TEMPLATE"]/default:Bay[@name="TEMPLATE"]',
				'//default:Substation[@name="ExistingSubstation"]',
			],
		},
		'SCL with existing TEMPLATE structure → no duplicate created': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="TEMPLATE">
						<VoltageLevel name="TEMPLATE">
							<Bay name="TEMPLATE"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:Substation[@name="TEMPLATE"]/default:VoltageLevel[@name="TEMPLATE"]/default:Bay[@name="TEMPLATE"]',
			],
			unexpectedQueries: ['//default:Substation[@name="TEMPLATE"][2]'],
		},
	}

	runSclTestCases({
		testCases,
		act: async ({ source }) => {
			await source.document.transaction(async (tx) => {
				await ensureSubstationTemplateStructure(tx)
			})
			return { assertDatabaseName: source.databaseName }
		},
	})
})
