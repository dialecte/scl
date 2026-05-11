import { ensureSubstationTemplateStructure } from '../ensure-substation-structure'
import { resolveStructureRef } from './resolve-structure-ref'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('resolveStructureRef', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		expectedTagName: 'Substation' | 'VoltageLevel' | 'Bay'
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'Function under Substation → resolves to Substation': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl-uuid">
							<Bay ${id}="bay1" name="TEMPLATE" uuid="bay-uuid"/>
						</VoltageLevel>
						<Function ${id}="func1" name="HMI Function" uuid="func-uuid"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
			expectedTagName: 'Substation',
		},
		'Function under Bay → resolves to Bay': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl-uuid">
							<Bay ${id}="bay1" name="TEMPLATE" uuid="bay-uuid">
								<Function ${id}="func1" name="CB Function" uuid="func-uuid"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
			expectedTagName: 'Bay',
		},
		'FunctionCategory under Substation Private → resolves to Substation': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<Private ${id}="priv1" type="eIEC61850-6-100">
							<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="PROTECTION" uuid="fcat-uuid"/>
						</Private>
						<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl-uuid">
							<Bay ${id}="bay1" name="TEMPLATE" uuid="bay-uuid"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'FunctionCategory', id: 'fcat1' } as Scl.Ref<'FunctionCategory'>,
			expectedTagName: 'Substation',
		},
		'Application under Bay Private → resolves to Bay': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl-uuid">
							<Bay ${id}="bay1" name="TEMPLATE" uuid="bay-uuid">
								<Private ${id}="priv1" type="eIEC61850-6-100">
									<eIEC61850-6-100:Application ${id}="app1" name="CB" uuid="app-uuid" type="HV_interface"/>
								</Private>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'Application', id: 'app1' } as Scl.Ref<'Application'>,
			expectedTagName: 'Bay',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const structure = await source.transaction(async (tx) => {
				return ensureSubstationTemplateStructure(tx)
			})

			const result = await resolveStructureRef(source.query, testCase.ref, structure)

			expect(result.tagName).toBe(testCase.expectedTagName)
		},
	})
})
