import { resolveMappedLNode } from './resolve-mapped-lnode'
import { resolveMappedLNodes } from './resolve-mapped-lnodes'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	lnodes: readonly string[]
	/** The logical node implementing each LNode, by LNode id; an LNode nothing implements is absent. */
	expected: Record<string, string>
}

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = `${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor"`
const LN_UUID = '80000000-0000-4000-8000-000000000001'

describe('one LNode and many LNodes give the same answer', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'LN0 named by lnUuid → that LN0 on both paths': {
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="LLN0" lnUuid="${LN_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN0 lnClass="LLN0" inst="" uuid="${LN_UUID}" ${ID}="ln0"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: 'ln0' },
		},

		'LN0 named by its names → that LN0 on both paths': {
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="LLN0" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN0 lnClass="LLN0" inst="" ${ID}="ln0"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: 'ln0' },
		},

		'vendor LN directly under the LDevice before the native one, by lnUuid → the native LN': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<vendor:LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="vendor-ln"/>
									<LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: 'native-ln' },
		},

		'vendor LN directly under the LDevice before the native one, by names → the native LN': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<vendor:LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="vendor-ln"/>
									<LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: 'native-ln' },
		},

		'LN of the document namespace inside a Private, by lnUuid → nothing': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<!-- no native XCBR1 -->
									<Private type="vendor" ${ID}="payload"><LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="wrapped-ln"/></Private>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: {},
		},

		'LN0 then LN carrying one uuid → the LN0, first in document order': {
			allowIncoherentReferences: 'two logical nodes carry one uuid',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN0 lnClass="LLN0" inst="" uuid="${LN_UUID}" ${ID}="ln0"/>
									<LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: 'ln0' },
		},

		'LN in a first IED and LN0 in a second carrying one uuid → the LN, first in document order': {
			allowIncoherentReferences: 'two logical nodes carry one uuid',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="first-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<IED name="IED2" ${ID}="ied-2">
						<AccessPoint name="AP1" ${ID}="ap-2">
							<Server ${ID}="srv-2">
								<LDevice inst="LD0" ${ID}="ld-2">
									<LN0 lnClass="LLN0" inst="" uuid="${LN_UUID}" ${ID}="second-ln0"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: { lnode: 'first-ln' },
		},

		'only an LN outside any IED carrying the uuid → nothing': {
			allowIncoherentReferences: 'the only element carrying the uuid is outside the IED section',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode"/>
						<LDevice inst="LD0" ${ID}="stray-ld"><LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="stray-ln"/></LDevice>
					</Substation>
				</SCL>`,
			lnodes: ['lnode'],
			expected: {},
		},

		'IED name holding a slash, named by names → the same LN on both paths': {
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="A/B" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="lnode"/>
					</Substation>
					<IED name="A/B" ${ID}="ied-1">
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
			expected: { lnode: 'native-ln' },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const refs = testCase.lnodes.map((id) => ({ tagName: 'LNode' as const, id }))
		const batch = await resolveMappedLNodes(source.query, { lnodes: refs })
		const records = await source.query.getRecords(refs)
		const singles = await Promise.all(
			records.map((lnode) => resolveMappedLNode(source.query, lnode as Scl.TrackedRecord<'LNode'>)),
		)
		const fromBatch = Object.fromEntries([...batch].map(([id, mapped]) => [id, mapped.ln.id]))
		const fromSingles = Object.fromEntries(
			testCase.lnodes.flatMap((id, index) => {
				const ln = singles[index]
				return ln ? [[id, ln.id]] : []
			}),
		)
		expect({ batch: fromBatch, single: fromSingles }).toEqual({
			batch: testCase.expected,
			single: testCase.expected,
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})
