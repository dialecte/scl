import { resolveFunctionSatellites } from './satellites'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>

type TestCase = SclTest.BaseXmlTestCase & { expectedTags: string[] }

describe('resolveFunctionSatellites (function-layer owns its satellites)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'finds the FunctionCategory that classifies the function': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
							<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="cat-src-uuid" ${id}="cat-s">
								<eIEC61850-6-100:FunctionCatRef functionUuid="fn-src-uuid" function="TEMPLATE/Prot" ${id}="catref-s"/>
							</eIEC61850-6-100:FunctionCategory>
						</Private>
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
									<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>`,
			expectedTags: ['FunctionCategory'],
		},

		'returns nothing for a function with no classification': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>`,
			expectedTags: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const satellites = await resolveFunctionSatellites(source.query, { primaryRef: functionRef })
		expect(satellites.map((ref) => ref.tagName).sort()).toEqual(testCase.expectedTags.sort())
	}

	runSclTestCases.withoutExport({ testCases, act })
})
