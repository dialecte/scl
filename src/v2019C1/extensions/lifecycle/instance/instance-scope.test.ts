import { collectInstanceScope } from './instance-scope'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('the scope of an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		instanceRootRef: Scl.Ref<Scl.ElementsOf>
		/** Record ids outside the instance's subtree, each said in or out of its scope. */
		expected: Record<string, 'in' | 'out'>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"an IED instance whose input names a logical node of another IED → that logical node in the instance's scope":
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" ${id}="ln0-t">
											<Inputs ${id}="inputs-t">
												<ExtRef iedName="OTHER" ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" intAddr="Pos" lnUuid="other-xcbr" uuid="ext-ins" ${id}="ext-t"/>
											</Inputs>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<IED name="OTHER" uuid="other-ied" ${id}="other-ied-t">
							<AccessPoint name="AP1" uuid="other-ap" ${id}="other-ap-t">
								<Server ${id}="other-srv-t">
									<Authentication ${id}="other-auth-t"/>
									<LDevice inst="LD1" uuid="other-ld" ${id}="other-ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="other-ln0" ${id}="other-ln0-t"/>
										<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="other-xcbr" ${id}="other-xcbr-t"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-t">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
							<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-t"/>
						</DataTypeTemplates>
					</SCL>
				`,
				instanceRootRef: { tagName: 'IED', id: 'ied-t' } as Scl.Ref<Scl.ElementsOf>,
				expected: { 'other-xcbr-t': 'in', 'other-ln0-t': 'out' },
			},
		"a function whose logical node is implemented by a logical node of an IED → that logical node out of the function's scope":
			{
				// the LNode's binding is the binding rules': no element of the function's
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Substation name="S1" ${id}="sub-t">
							<VoltageLevel name="V1" ${id}="vl-t">
								<Bay name="B1" ${id}="bay-t">
									<Function name="Breaker" uuid="fn-ins" ${id}="fn-t">
										<LNode iedName="IED7" ldInst="LD1" lnClass="XCBR" lnInst="1" lnUuid="xcbr-ins" uuid="lnode-ins" ${id}="lnode-t"/>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
						<IED name="IED7" uuid="ied-ins" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" ${id}="ln0-t"/>
										<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-ins" ${id}="xcbr-t"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-t">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
							<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-t"/>
						</DataTypeTemplates>
					</SCL>
				`,
				instanceRootRef: { tagName: 'Function', id: 'fn-t' } as Scl.Ref<Scl.ElementsOf>,
				expected: { 'xcbr-t': 'out' },
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const scope = await collectInstanceScope(source.query, testCase.instanceRootRef)
		const read = Object.fromEntries(
			Object.keys(testCase.expected).map((recordId) => [
				recordId,
				scope.has(recordId) ? 'in' : 'out',
			]),
		)
		expect(read).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
