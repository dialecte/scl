import { fsd } from './fsd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTargetXml = /* xml */ `
	<SCL ${ns} ${id}="root" version="2007" revision="C" release="5"/>
`

describe('fsd', () => {
	// ── FunctionCategory uuid remapping across deepClone ──────────────────
	// Source has FunctionCatRef.functionUuid pointing to SubFunction.uuid.
	// After extraction (SubFunction promoted to Function with new uuid),
	// FunctionCatRef must reference the new Function uuid → FunctionCategory preserved.

	describe('FunctionCategory uuid remapping after SubFunction promotion', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			targetXml: string
			act: (source: Scl.Document, target: Scl.Document) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			'FunctionCatRef referencing SubFunction uuid → remapped to new Function uuid, FunctionCategory preserved':
				{
					sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE">
							<VoltageLevel ${id}="vl1" name="TEMPLATE">
								<Bay ${id}="bay1" name="TEMPLATE"/>
							</VoltageLevel>
							<Private ${id}="cat-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="MMS CLIENTS">
									<eIEC61850-6-100:SubCategory ${id}="scat1" name="HMI">
										<eIEC61850-6-100:FunctionCatRef ${id}="fcref1" functionUuid="subf1-uuid"/>
									</eIEC61850-6-100:SubCategory>
								</eIEC61850-6-100:FunctionCategory>
							</Private>
							<Function ${id}="func1" name="HMI Function" uuid="func1-uuid">
								<SubFunction ${id}="subf1" name="HMI" uuid="subf1-uuid"/>
							</Function>
						</Substation>
					</SCL>
				`,
					targetXml: emptyTargetXml,
					act: async (source, target) => {
						await target.transaction(async (tx) => {
							await fsd(tx, {
								sourceQuery: source.query,
								functionRef: { tagName: 'SubFunction', id: 'subf1' },
								tool: 'TEST',
								who: 'test',
							})
						})
					},
					expectedQueries: [
						'//default:Substation//v2019C1:FunctionCategory[@name="MMS CLIENTS"]',
						'//v2019C1:SubCategory[@name="HMI"]',
						'//v2019C1:FunctionCatRef[@functionUuid]',
					],
					unexpectedQueries: ['//v2019C1:FunctionCatRef[@functionUuid="subf1-uuid"]'],
				},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act: async ({ source, target, testCase }) => {
				if (!target) throw new Error('target required')
				await testCase.act(source, target)
				return { assertOn: 'target' }
			},
		})
	})
})
