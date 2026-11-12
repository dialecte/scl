import { resolveMappedLNodes } from './resolve-mapped-lnodes'

import { describe, expect } from 'vitest'

import { countQueryReads } from '@/v2019C1/test/count-query-reads'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { MappedLNode } from './resolve-mapped-lnodes.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	lnodes: readonly string[]
	expected: Record<string, MappedLNode>
}

type ReadCase = SclTest.BaseXmlTestCase & { lnodes: readonly string[] }

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NATIVE_UUID = '10000000-0000-4000-8000-000000000001'
const OTHER_UUID = '10000000-0000-4000-8000-000000000002'
const MISSING_UUID = '10000000-0000-4000-8000-000000000099'

const IN_IED_1 = {
	ln: { tagName: 'LN', id: 'native-ln' },
	ied: { tagName: 'IED', id: 'ied-1' },
} satisfies MappedLNode

describe('resolveMappedLNodes', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'lnUuid naming one LN, names naming another → the LN of the uuid': {
			allowIncoherentReferences: 'the uuid and the names of the LNode name two logical nodes',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED2" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${NATIVE_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<IED name="IED2" ${ID}="ied-2">
						<AccessPoint name="AP1" ${ID}="ap-2">
							<Server ${ID}="srv-2">
								<LDevice inst="LD0" ${ID}="ld-2">
									<LN lnClass="XCBR" inst="1" uuid="${OTHER_UUID}" ${ID}="named-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: IN_IED_1 },
		},

		'lnUuid naming nothing, names naming an LN → nothing': {
			allowIncoherentReferences: 'the uuid of the LNode names no logical node',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${MISSING_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: {},
		},

		'no lnUuid, complete names → the LN of the names': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" prefix="P" lnClass="XCBR" lnInst="1" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN prefix="P" lnClass="XCBR" inst="1" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: IN_IED_1 },
		},

		'no lnUuid, names without a logical device → nothing': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<!-- no ldInst -->
						<LNode iedName="IED1" lnClass="XCBR" lnInst="1" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: {},
		},

		'LN0 named by lnUuid → that LN0 with its IED': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="LLN0" lnUuid="${NATIVE_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN0 lnClass="LLN0" inst="" uuid="${NATIVE_UUID}" ${ID}="ln0-1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: {
				lnode: { ln: { tagName: 'LN0', id: 'ln0-1' }, ied: { tagName: 'IED', id: 'ied-1' } },
			},
		},

		'LN0 named by its names → that LN0 with its IED': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED2" ldInst="LD0" lnClass="LLN0" ${ID}="lnode"/>
					</Substation>
					<IED name="IED2" ${ID}="ied-2">
						<AccessPoint name="AP1" ${ID}="ap-2">
							<Server ${ID}="srv-2">
								<LDevice inst="LD0" ${ID}="ld-2">
									<LN0 lnClass="LLN0" inst="" ${ID}="ln0-2"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: {
				lnode: { ln: { tagName: 'LN0', id: 'ln0-2' }, ied: { tagName: 'IED', id: 'ied-2' } },
			},
		},

		'lnUuid naming an LN held by an access point → that LN and its IED': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" lnClass="XCBR" lnInst="1" lnUuid="${NATIVE_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="native-ln"/>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: IN_IED_1 },
		},

		'vendor look-alike before the native LN, named by uuid → the native LN': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					<Private type="vendor" ${ID}="before">
							<vendor:IED name="IED1" ${ID}="vendor-ied">
								<vendor:AccessPoint name="AP1" ${ID}="vendor-ap">
									<vendor:Server ${ID}="vendor-srv">
										<vendor:LDevice inst="LD0" ${ID}="vendor-ld">
											<vendor:LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="vendor-ln"/>
										</vendor:LDevice>
									</vendor:Server>
								</vendor:AccessPoint>
							</vendor:IED>
						</Private>
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${NATIVE_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
							<AccessPoint name="AP1" ${ID}="ap-1">
								<Server ${ID}="srv-1">
									<LDevice inst="LD0" ${ID}="ld-1">
										<LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="native-ln"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: IN_IED_1 },
		},

		'vendor look-alike before the native LN, named by names → the native LN': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					<Private type="vendor" ${ID}="before">
							<vendor:IED name="IED1" ${ID}="vendor-ied">
								<vendor:AccessPoint name="AP1" ${ID}="vendor-ap">
									<vendor:Server ${ID}="vendor-srv">
										<vendor:LDevice inst="LD0" ${ID}="vendor-ld">
											<vendor:LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="vendor-ln"/>
										</vendor:LDevice>
									</vendor:Server>
								</vendor:AccessPoint>
							</vendor:IED>
						</Private>
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
							<AccessPoint name="AP1" ${ID}="ap-1">
								<Server ${ID}="srv-1">
									<LDevice inst="LD0" ${ID}="ld-1">
										<LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="native-ln"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: IN_IED_1 },
		},

		'vendor look-alike after the native LN, named by uuid → the native LN': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${NATIVE_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
							<AccessPoint name="AP1" ${ID}="ap-1">
								<Server ${ID}="srv-1">
									<LDevice inst="LD0" ${ID}="ld-1">
										<LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="native-ln"/>
<Private type="vendor" ${ID}="after"><vendor:LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="vendor-ln"/></Private>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: IN_IED_1 },
		},

		'vendor look-alike after the native LN, named by names → the native LN': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
							<AccessPoint name="AP1" ${ID}="ap-1">
								<Server ${ID}="srv-1">
									<LDevice inst="LD0" ${ID}="ld-1">
										<LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="native-ln"/>
<Private type="vendor" ${ID}="after"><vendor:LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="vendor-ln"/></Private>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: IN_IED_1 },
		},

		'only a vendor look-alike, named by uuid → nothing': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${NATIVE_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
							<AccessPoint name="AP1" ${ID}="ap-1">
								<Server ${ID}="srv-1">
									<LDevice inst="LD0" ${ID}="ld-1">
										<!-- no native XCBR1 -->
<Private type="vendor" ${ID}="payload"><vendor:LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="vendor-ln"/></Private>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: {},
		},

		'only a vendor look-alike, named by names → nothing': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
					
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
							<AccessPoint name="AP1" ${ID}="ap-1">
								<Server ${ID}="srv-1">
									<LDevice inst="LD0" ${ID}="ld-1">
										<!-- no native XCBR1 -->
<Private type="vendor" ${ID}="payload"><vendor:LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="vendor-ln"/></Private>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: {},
		},

		'two LNs of two IEDs carrying the uuid → the first in document order': {
			allowIncoherentReferences: 'two logical nodes carry one uuid',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${NATIVE_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" uuid="${NATIVE_UUID}" ${ID}="native-ln"/>
									
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<IED name="IED2" ${ID}="ied-2">
						<AccessPoint name="AP1" ${ID}="ap-2">
							<Server ${ID}="srv-2">
								<LDevice inst="LD0" ${ID}="ld-2">
									<LN lnClass="XCBR" inst="2" uuid="${NATIVE_UUID}" ${ID}="second-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: IN_IED_1 },
		},

		'two LNs of one path → the first in document order': {
			allowIncoherentReferences: 'two logical nodes carry one name path',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" ${ID}="native-ln"/>
									<LN lnClass="XCBR" inst="1" ${ID}="second-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: IN_IED_1 },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const lnodes = testCase.lnodes.map((id) => ({ tagName: 'LNode' as const, id }))
		const mapped = await resolveMappedLNodes(source.query, { lnodes })
		expect(Object.fromEntries(mapped)).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })

	const readCases: SclTest.TestCases<ReadCase> = {
		'two LNodes → the logical nodes of the document read once': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="first"/>
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="2" ${ID}="second"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" ${ID}="ln-1"/>
									<LN lnClass="XCBR" inst="2" ${ID}="ln-2"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['first', 'second'],
		},
	}

	async function actOnReads({ testCase, source }: SclTest.ActParams<ReadCase>): Promise<void> {
		const { query, reads } = countQueryReads(source.query)
		const lnodes = testCase.lnodes.map((id) => ({ tagName: 'LNode' as const, id }))
		await resolveMappedLNodes(query, { lnodes })
		expect(reads.filter((read) => read === 'findDescendants')).toHaveLength(1)
	}

	runSclTestCases.withoutExport({ testCases: readCases, act: actOnReads })
})
