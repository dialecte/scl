import { of } from './of'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ElementState } from '@/v2019C1'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * An ExtRef in later-binding form may also carry its service type when it is the service it expects: the form an ISD
 * writes. A service type other than the expected one still names a binding.
 */
describe('of — a later-binding ExtRef carrying its expected service as its service type', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: ElementState }

	const extRef = { tagName: 'ExtRef', id: 'ext-ref' } as const

	const testCases: SclTest.TestCases<TestCase> = {
		'ExtRef with an intAddr, a pDO, pServT GOOSE and serviceType GOOSE → later-binding': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="A" ${id}="ied">
						<AccessPoint name="AP1" ${id}="ap">
							<Server ${id}="server">
								<Authentication ${id}="authentication"/>
								<LDevice inst="LD1" ${id}="ld1">
									<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
									<LN lnClass="PTOC" inst="1" lnType="T1" ${id}="ptoc">
										<Inputs ${id}="inputs">
											<!-- no source: no iedName, ldInst, lnClass, doName, srcCBName -->
											<ExtRef intAddr="RemoteTrip" desc="Remote trip" pDO="Op" pServT="GOOSE" serviceType="GOOSE" ${id}="ext-ref"/>
										</Inputs>
									</LN>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			expected: 'later-binding',
		},
		'ExtRef with an intAddr, a pDO, pServT GOOSE and serviceType Report → no state': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="A" ${id}="ied">
						<AccessPoint name="AP1" ${id}="ap">
							<Server ${id}="server">
								<Authentication ${id}="authentication"/>
								<LDevice inst="LD1" ${id}="ld1">
									<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
									<LN lnClass="PTOC" inst="1" lnType="T1" ${id}="ptoc">
										<Inputs ${id}="inputs">
											<!-- the service type is not the expected one -->
											<ExtRef intAddr="RemoteTrip" desc="Remote trip" pDO="Op" pServT="GOOSE" serviceType="Report" ${id}="ext-ref"/>
										</Inputs>
									</LN>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			expected: undefined,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await of(source.query, extRef)
			expect(result.state).toEqual(testCase.expected)
		},
	})
})
