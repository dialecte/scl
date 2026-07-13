import { resolveAppliedSatellites } from './applied-satellites'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>

type TestCase = SclTest.BaseXmlTestCase & { expectedTags: string[] }

describe('resolveAppliedSatellites (cross-cutting: applies to any element in the subtree)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'finds a Variable applying to the function LNode (not just the function root)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
							<eIEC61850-6-100:Variable name="Prefix" value="DVNAME" uuid="var-src-uuid" ${id}="var-s">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/CSWI1" elementUuid="lnode-src-uuid" ${id}="vat-s"/>
							</eIEC61850-6-100:Variable>
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
			expectedTags: ['Variable'],
		},

		'excludes a Variable that lives INSIDE the function subtree (internal, not a satellite)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
									<Private type="eIEC61850-6-100" ${id}="fn-priv-s">
										<eIEC61850-6-100:Variable name="Inner" uuid="inner-var-uuid" ${id}="inner-var-s">
											<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot" elementUuid="fn-src-uuid" ${id}="inner-vat-s"/>
										</eIEC61850-6-100:Variable>
									</Private>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>`,
			expectedTags: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const satellites = await resolveAppliedSatellites(source.query, { primaryRef: functionRef })
		expect(satellites.map((ref) => ref.tagName).sort()).toEqual(testCase.expectedTags.sort())
	}

	runSclTestCases.withoutExport({ testCases, act })
})
