import { resolveMappedLNode } from './resolve-mapped-lnode'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	lnodeId: string
	expected: { tagName: string; id: string } | null
}

const ID = CUSTOM_RECORD_ID_ATTRIBUTE

describe('resolveMappedLNode, uuid first, native only', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'lnUuid naming one LN, names naming another → the LN of the uuid': {
			allowIncoherentReferences: 'the uuid and the names of the LNode name two logical nodes',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="2" lnUuid="30000000-0000-4000-8000-000000000001" ${ID}="lnode-1"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" uuid="30000000-0000-4000-8000-000000000001" ${ID}="ln-of-uuid"/>
									<LN lnClass="XCBR" inst="2" ${ID}="ln-of-names"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			lnodeId: 'lnode-1',
			expected: { tagName: 'LN', id: 'ln-of-uuid' },
		},

		'lnUuid naming nothing, names naming an LN → undefined': {
			allowIncoherentReferences: 'the uuid of the LNode names no logical node',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="30000000-0000-4000-8000-000000000099" ${ID}="lnode-1"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" ${ID}="ln-of-names"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			lnodeId: 'lnode-1',
			expected: null,
		},

		'lnUuid carried by a vendor LN before the native one → the native LN': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="2" lnUuid="30000000-0000-4000-8000-000000000001" ${ID}="lnode-1"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<Private type="vendor" ${ID}="payload"><vendor:LN lnClass="XCBR" inst="1" uuid="30000000-0000-4000-8000-000000000001" ${ID}="vendor-ln"/></Private><LN lnClass="XCBR" inst="1" uuid="30000000-0000-4000-8000-000000000001" ${ID}="native-ln"/><LN lnClass="XCBR" inst="2" ${ID}="ln-of-names"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			lnodeId: 'lnode-1',
			expected: { tagName: 'LN', id: 'native-ln' },
		},

		'lnUuid carried only by a vendor LN, names naming a native LN → undefined': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="2" lnUuid="30000000-0000-4000-8000-000000000001" ${ID}="lnode-1"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<Private type="vendor" ${ID}="payload"><vendor:LN lnClass="XCBR" inst="1" uuid="30000000-0000-4000-8000-000000000001" ${ID}="vendor-ln"/></Private><LN lnClass="XCBR" inst="2" ${ID}="ln-of-names"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			lnodeId: 'lnode-1',
			expected: null,
		},

		'no lnUuid, a vendor LN of those names before the native one → the native LN': {
			allowIncoherentReferences: 'the look-alike repeats the names of a native element',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="lnode-1"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<Private type="vendor" ${ID}="payload"><vendor:LN lnClass="XCBR" inst="1" uuid="30000000-0000-4000-8000-000000000001" ${ID}="vendor-ln"/></Private><LN lnClass="XCBR" inst="1" uuid="30000000-0000-4000-8000-000000000001" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			lnodeId: 'lnode-1',
			expected: { tagName: 'LN', id: 'native-ln' },
		},

		'no lnUuid, only a vendor LN of those names → undefined': {
			allowIncoherentReferences: 'the only element of those names is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="lnode-1"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<Private type="vendor" ${ID}="payload"><vendor:LN lnClass="XCBR" inst="1" uuid="30000000-0000-4000-8000-000000000001" ${ID}="vendor-ln"/></Private>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			lnodeId: 'lnode-1',
			expected: null,
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const lnode = await source.query.getRecord({ tagName: 'LNode', id: testCase.lnodeId })
		const ln = await resolveMappedLNode(source.query, lnode as Scl.TrackedRecord<'LNode'>)
		expect(ln ? { tagName: ln.tagName, id: ln.id } : null).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
