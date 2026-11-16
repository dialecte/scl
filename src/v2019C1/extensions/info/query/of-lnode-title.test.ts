import { of } from './of'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('of - the title of an LNode bound to an IED', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		expectedTitle: string
		mode?: 'compact' | 'full'
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'LNode with prefix+lnClass+lnInst → concatenated title': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="B1" ${id}="b1">
								<LNode iedName="IED_A" ldInst="LD0" prefix="P" lnClass="XCBR" lnInst="1" ${id}="lnode-1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap-a">
							<Server ${id}="srv-a">
								<Authentication ${id}="auth-a"/>
								<LDevice inst="LD0" ${id}="ld-a">
									<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0-a"/>
									<LN prefix="P" lnClass="XCBR" inst="1" lnType="T1" ${id}="ln-a"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode-1' },
			expectedTitle: 'PXCBR1',
		},
		'LNode with empty prefix → lnClass+lnInst only': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="B1" ${id}="b1">
								<LNode iedName="IED_A" ldInst="LD0" prefix="" lnClass="XCBR" lnInst="1" ${id}="lnode-2"/>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap-a">
							<Server ${id}="srv-a">
								<Authentication ${id}="auth-a"/>
								<LDevice inst="LD0" ${id}="ld-a">
									<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0-a"/>
									<LN prefix="" lnClass="XCBR" inst="1" lnType="T1" ${id}="ln-a"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode-2' },
			expectedTitle: 'XCBR1',
		},
		'LNode in full mode → iedName/ldInst/PXCBR1': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="B1" ${id}="b1">
								<LNode iedName="IED_A" ldInst="LD0" prefix="P" lnClass="XCBR" lnInst="1" ${id}="lnode-full"/>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap-a">
							<Server ${id}="srv-a">
								<Authentication ${id}="auth-a"/>
								<LDevice inst="LD0" ${id}="ld-a">
									<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0-a"/>
									<LN prefix="P" lnClass="XCBR" inst="1" lnType="T1" ${id}="ln-a"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode-full' },
			mode: 'full',
			expectedTitle: 'IED_A/LD0/PXCBR1',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await of(source.query, testCase.ref, { mode: testCase.mode })
			expect(result.title).toBe(testCase.expectedTitle)
		},
	})
})
