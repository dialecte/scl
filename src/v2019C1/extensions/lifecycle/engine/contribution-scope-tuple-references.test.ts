import { findReferencesOutsideScope } from './contribution-scope'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('the references of a placement naming outside its scope, for an IED', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The uuids the placement places. */
		scope: string[]
		/** The references told outside the scope, by record id. */
		expected: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an input naming a logical node of another IED, outside the placement → never left out: its names are the reference':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
											<Inputs ${id}="inputs-s">
												<ExtRef iedName="OTHER" ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" intAddr="Pos" lnUuid="other-xcbr" uuid="ext-src" ${id}="ext-s"/>
											</Inputs>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<IED name="OTHER" uuid="other-ied" ${id}="other-ied-s">
							<AccessPoint name="AP1" uuid="other-ap" ${id}="other-ap-s">
								<Server ${id}="other-srv-s">
									<Authentication ${id}="other-auth-s"/>
									<LDevice inst="LD1" uuid="other-ld" ${id}="other-ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="other-ln0" ${id}="other-ln0-s"/>
										<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="other-xcbr" ${id}="other-xcbr-s"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-s">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
							<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-s"/>
						</DataTypeTemplates>
					</SCL>
				`,
				// the placement places IED TPL only
				scope: ['ied-src', 'ap-src', 'ld-src', 'ln0-src', 'ext-src'],
				expected: [],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const outside = await findReferencesOutsideScope(source.query, {
			root: { tagName: 'IED', id: 'ied-s' } as Scl.Ref<Scl.ElementsOf>,
			scope: new Set(testCase.scope),
		})
		expect(outside.map((reference) => reference.reference.id)).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
