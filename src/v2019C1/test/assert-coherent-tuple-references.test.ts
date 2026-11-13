import { collectXmlReferenceViolations } from './assert-coherent-scl-references'
import { ALL_XMLNS_NAMESPACES, runSclTestCases } from './hydrated-test'

import { describe, expect } from 'vitest'

import type { ReferenceViolation } from './assert-coherent-scl-references.types'
import type { SclTest } from './hydrated-test.types'

const ns = ALL_XMLNS_NAMESPACES

describe('collectReferenceViolations on tuple references', () => {
	type TestCase = SclTest.BaseTestCase & {
		xml: string
		expected: ReferenceViolation[]
	}

	const testCases: Record<string, TestCase> = {
		'ConnectedAP and FCDA naming by uuid nothing their IED holds, ServerAt an LN → dangling, wrong-target':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<Communication>
							<SubNetwork name="N1">
								<!-- I1 holds no access point carrying dead-ap -->
								<ConnectedAP iedName="I1" apName="AP1" apUuid="dead-ap" />
							</SubNetwork>
						</Communication>
						<IED name="I1">
							<AccessPoint name="AP1">
								<Server>
									<Authentication />
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T">
											<DataSet name="DS1">
												<!-- no logical node carrying dead-ln -->
												<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="dead-ln" />
											</DataSet>
										</LN0>
										<LN lnClass="CSWI" inst="1" lnType="CSWI_T" uuid="cswi1-uuid" />
									</LDevice>
								</Server>
							</AccessPoint>
							<AccessPoint name="AP2">
								<ServerAt apName="AP1" apUuid="cswi1-uuid" />
							</AccessPoint>
						</IED>
					</SCL>
				`,
				expected: [
					{
						kind: 'dangling',
						referenceTagName: 'ConnectedAP',
						uuidAttribute: 'apUuid',
						uuid: 'dead-ap',
					},
					{ kind: 'dangling', referenceTagName: 'FCDA', uuidAttribute: 'lnUuid', uuid: 'dead-ln' },
					{
						kind: 'wrong-target',
						referenceTagName: 'ServerAt',
						uuidAttribute: 'apUuid',
						uuid: 'cswi1-uuid',
						targetTagName: 'LN',
					},
				],
			},
		'LNode naming by uuid a logical node of an IED the document does not hold → no violation': {
			xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<!-- no IED P1 in the document: its logical node is outside it -->
						<LNode iedName="P1" ldInst="LD1" lnClass="XCBR" lnInst="1" lnUuid="outside-ln" />
					</Substation>
				</SCL>
			`,
			expected: [],
		},
		'ExtRef whose names are not those of the logical node its uuid names → path violation naming its address':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<IED name="I1">
							<AccessPoint name="AP1">
								<Server>
									<Authentication />
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T">
											<Inputs>
												<!-- names XCBR2, its uuid XCBR1 -->
												<ExtRef iedName="I1" ldInst="LD1" lnClass="XCBR" lnInst="2" doName="Pos" lnUuid="xcbr1-uuid" />
											</Inputs>
										</LN0>
										<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr1-uuid" />
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				expected: [
					{
						kind: 'path',
						referenceTagName: 'ExtRef',
						pathAttribute: 'iedName ldInst prefix lnClass lnInst',
						uuidAttribute: 'lnUuid',
						uuid: 'xcbr1-uuid',
						written: 'ln:I1/LD1/XCBR2',
						expected: 'ln:I1/LD1/XCBR1',
					},
				],
			},
	}

	async function act(testCase: TestCase): Promise<void> {
		const violations = await collectXmlReferenceViolations({ xml: testCase.xml })
		expect(violations).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
