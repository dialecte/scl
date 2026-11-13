import { of } from './of'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & { expected: string }

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = `${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor"`
const LN_UUID = '70000000-0000-4000-8000-000000000001'

describe('the mapping of an LNode is read from native logical nodes', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'lnUuid carried by a vendor LN and a native LN → mapped to the native one': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Private type="vendor" ${ID}="payload">
						<vendor:LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="vendor-ln"/>
					</Private>
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			expected: 'specification-ied',
		},

		'lnUuid carried only by a vendor LN → unmapped': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<Private type="vendor" ${ID}="payload">
										<vendor:LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="vendor-ln"/>
									</Private>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			expected: 'unmapped',
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const info = await of(source.query, { tagName: 'LNode', id: 'lnode' }, { withState: true })
		expect(info.state).toMatchObject({ mapping: testCase.expected })
	}

	runSclTestCases.withoutExport({ testCases, act })
})
