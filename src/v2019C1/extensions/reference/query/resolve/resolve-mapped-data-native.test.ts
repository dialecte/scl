import { resolveMappedData } from './resolve-mapped-data'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & { expectedLn: string | null }

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = `${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor"`
const LN_UUID = '70000000-0000-4000-8000-000000000001'

describe('resolveMappedData counts native logical nodes only', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'data following an LNode whose lnUuid a vendor LN also carries → the native LN': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Private type="vendor" ${ID}="payload">
						<vendor:LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="look-alike-ln"/>
					</Private>
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode">
							<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
								<eIEC61850-6-100:DOS name="Mod" ${ID}="dos"/>
							</Private>
						</LNode>
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
			expectedLn: 'native-ln',
		},

		'data naming by mappedLnUuid only a vendor LN → nothing implements it': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="lnode">
							<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
								<eIEC61850-6-100:DOS name="Mod" mappedLnUuid="${LN_UUID}" ${ID}="dos"/>
							</Private>
						</LNode>
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
			expectedLn: null,
		},

		'data naming by mappedDoName only a vendor LN of a native logical device → nothing implements it':
			{
				allowIncoherentReferences: 'the only element of those names is in a vendor payload',
				sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="lnode">
							<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
								<eIEC61850-6-100:DOS name="Mod" mappedDoName="IED1/LD0/XCBR1.Mod" ${ID}="dos"/>
							</Private>
						</LNode>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<!-- no native XCBR1 -->
									<Private type="vendor" ${ID}="payload"><vendor:LN lnClass="XCBR" inst="1" ${ID}="vendor-ln"/></Private>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
				expectedLn: null,
			},

		'data naming by mappedDoName only an LN of a vendor IED → nothing implements it': {
			allowIncoherentReferences: 'the only element of those names is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Private type="vendor" ${ID}="payload">
						<vendor:IED name="IED1" ${ID}="vendor-ied">
							<vendor:AccessPoint name="AP1" ${ID}="vendor-ap">
								<vendor:Server ${ID}="vendor-srv">
									<vendor:LDevice inst="LD0" ${ID}="vendor-ld">
										<vendor:LN lnClass="XCBR" inst="1" ${ID}="vendor-ln"/>
									</vendor:LDevice>
								</vendor:Server>
							</vendor:AccessPoint>
						</vendor:IED>
					</Private>
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="lnode">
							<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
								<eIEC61850-6-100:DOS name="Mod" mappedDoName="IED1/LD0/XCBR1.Mod" ${ID}="dos"/>
							</Private>
						</LNode>
					</Substation>
					<!-- no native IED1 -->
				</SCL>`,
			expectedLn: null,
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const mapped = await resolveMappedData(source.query, {
			reference: { tagName: 'DOS', id: 'dos' },
		})
		expect(mapped?.ln.id ?? null).toBe(testCase.expectedLn)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
