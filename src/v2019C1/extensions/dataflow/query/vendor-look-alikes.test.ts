import { all } from './all'
import { ofSourceRef } from './of-source-ref'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = `${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor"`
const SENDER_LN_UUID = '20000000-0000-4000-8000-000000000001'
const RECEIVER_LN_UUID = '20000000-0000-4000-8000-000000000002'
const SENDER_LNODE_UUID = '20000000-0000-4000-8000-000000000003'
const EXT_REF_UUID = '20000000-0000-4000-8000-000000000004'
const RESOURCE_UUID = '20000000-0000-4000-8000-000000000005'
const SIGNAL = { tagName: 'SourceRef', id: 'signal' } as const
const P1 = { tagName: 'IED', id: 'ied-p1' } as const
const B1 = { tagName: 'IED', id: 'ied-b1' } as const
const SENDER = { tagName: 'LNode', id: 'sender' } as const

type AllocationCase = SclTest.BaseXmlTestCase & {
	expected: {
		allocation: string
		mappedIeds: { holder?: Scl.Ref<'IED'>; other?: Scl.Ref<'IED'> }
		other: Scl.Ref<'LNode'>
	}
}

type DanglingCase = SclTest.BaseXmlTestCase & { expectedAttributes: readonly string[] }

type ListingCase = SclTest.BaseXmlTestCase & { expectedSignals: readonly string[] }

describe('dataflow reads vendor look-alikes as vendor payload', () => {
	const allocationCases: SclTest.TestCases<AllocationCase> = {
		'vendor LN carrying the uuid of the native LN → the LNode stays allocated to the native IED': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native logical node',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Private type="vendor" ${ID}="payload">
						<vendor:LN lnClass="PTRC" inst="1" uuid="${SENDER_LN_UUID}" ${ID}="vendor-ln"/>
					</Private>
					<Substation name="S1" ${ID}="substation">
						<Function name="F1" ${ID}="function">
							<LNode iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" lnUuid="${SENDER_LN_UUID}" uuid="${SENDER_LNODE_UUID}" ${ID}="sender"/>
							<LNode iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${RECEIVER_LN_UUID}" ${ID}="receiver">
								<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
									<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" sourceLNodeUuid="${SENDER_LNODE_UUID}" ${ID}="signal"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED name="P1" ${ID}="ied-p1">
						<AccessPoint name="AP1" ${ID}="ap-p1">
							<Server ${ID}="server-p1">
								<LDevice inst="LD0" ${ID}="ld-p1">
									<LN lnClass="PTRC" inst="1" uuid="${SENDER_LN_UUID}" ${ID}="ln-p1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<IED name="B1" ${ID}="ied-b1">
						<AccessPoint name="AP1" ${ID}="ap-b1">
							<Server ${ID}="server-b1">
								<LDevice inst="LD0" ${ID}="ld-b1">
									<LN lnClass="XCBR" inst="1" uuid="${RECEIVER_LN_UUID}" ${ID}="ln-b1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			expected: { allocation: 'inter-ied', mappedIeds: { holder: B1, other: P1 }, other: SENDER },
		},

		'vendor IED after the native one, of the same names → the LNode named into it stays in the native IED':
			{
				allowIncoherentReferences: 'the look-alike repeats the names of a native element',
				sourceXml: /* xml */ `
					<SCL ${NS} ${ID}="root">
						<Substation name="S1" ${ID}="substation">
							<Function name="F1" ${ID}="function">
								<LNode iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" uuid="${SENDER_LNODE_UUID}" ${ID}="sender"/>
								<LNode iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="receiver">
									<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
										<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
											<eIEC61850-6-100:SourceRef input="Trip" sourceLNodeUuid="${SENDER_LNODE_UUID}" ${ID}="signal"/>
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</Function>
						</Substation>
						<IED name="P1" ${ID}="ied-p1">
							<AccessPoint name="AP1" ${ID}="ap-p1">
								<Server ${ID}="server-p1">
									<LDevice inst="LD0" ${ID}="ld-p1">
										<LN lnClass="PTRC" inst="1" ${ID}="ln-p1"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<IED name="B1" ${ID}="ied-b1">
							<AccessPoint name="AP1" ${ID}="ap-b1">
								<Server ${ID}="server-b1">
									<LDevice inst="LD0" ${ID}="ld-b1">
										<LN lnClass="XCBR" inst="1" ${ID}="ln-b1"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<Private type="vendor" ${ID}="payload">
							<vendor:IED name="P1" ${ID}="vendor-ied">
								<vendor:AccessPoint name="AP1" ${ID}="vendor-ap">
									<vendor:Server ${ID}="vendor-server">
										<vendor:LDevice inst="LD0" ${ID}="vendor-ld">
											<vendor:LN lnClass="PTRC" inst="1" ${ID}="vendor-ln"/>
										</vendor:LDevice>
									</vendor:Server>
								</vendor:AccessPoint>
							</vendor:IED>
						</Private>
					</SCL>`,
				expected: { allocation: 'inter-ied', mappedIeds: { holder: B1, other: P1 }, other: SENDER },
			},

		'vendor LNode after the native one, carrying its uuid → the signal names the native LNode': {
			allowIncoherentReferences: 'the look-alike carries the uuid of the native LNode',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="substation">
						<Function name="F1" ${ID}="function">
							<LNode iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" uuid="${SENDER_LNODE_UUID}" ${ID}="sender"/>
							<LNode iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="receiver">
								<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
									<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" sourceLNodeUuid="${SENDER_LNODE_UUID}" ${ID}="signal"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
							<Private type="vendor" ${ID}="payload">
								<vendor:LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="${SENDER_LNODE_UUID}" ${ID}="vendor-lnode"/>
							</Private>
						</Function>
					</Substation>
					<IED name="P1" ${ID}="ied-p1">
						<AccessPoint name="AP1" ${ID}="ap-p1">
							<Server ${ID}="server-p1">
								<LDevice inst="LD0" ${ID}="ld-p1">
									<LN lnClass="PTRC" inst="1" ${ID}="ln-p1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<IED name="B1" ${ID}="ied-b1">
						<AccessPoint name="AP1" ${ID}="ap-b1">
							<Server ${ID}="server-b1">
								<LDevice inst="LD0" ${ID}="ld-b1">
									<LN lnClass="XCBR" inst="1" ${ID}="ln-b1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			expected: { allocation: 'inter-ied', mappedIeds: { holder: B1, other: P1 }, other: SENDER },
		},

		'vendor naming of the native LNode → the signal still finds it by its path': {
			allowIncoherentReferences: 'the look-alike names the native LNode otherwise',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="substation">
						<Function name="F1" ${ID}="function">
							<LNode iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" ${ID}="sender">
								<Private type="vendor" ${ID}="payload">
									<vendor:LNodeSpecNaming sLnClass="PDIF" sLnInst="9" ${ID}="vendor-naming"/>
								</Private>
							</LNode>
							<LNode iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="receiver">
								<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
									<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" source="S1/F1/PTRC1" ${ID}="signal"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED name="P1" ${ID}="ied-p1">
						<AccessPoint name="AP1" ${ID}="ap-p1">
							<Server ${ID}="server-p1">
								<LDevice inst="LD0" ${ID}="ld-p1">
									<LN lnClass="PTRC" inst="1" ${ID}="ln-p1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<IED name="B1" ${ID}="ied-b1">
						<AccessPoint name="AP1" ${ID}="ap-b1">
							<Server ${ID}="server-b1">
								<LDevice inst="LD0" ${ID}="ld-b1">
									<LN lnClass="XCBR" inst="1" ${ID}="ln-b1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			expected: { allocation: 'inter-ied', mappedIeds: { holder: B1, other: P1 }, other: SENDER },
		},
	}

	async function actOnAllocation({
		testCase,
		source,
	}: SclTest.ActParams<AllocationCase>): Promise<void> {
		const dataflow = await ofSourceRef(source.query, { ref: SIGNAL })
		expect(dataflow.specification).toMatchObject({
			allocation: testCase.expected.allocation,
			mappedIeds: testCase.expected.mappedIeds,
			other: { lnode: testCase.expected.other },
		})
	}

	runSclTestCases.withoutExport({ testCases: allocationCases, act: actOnAllocation })

	const listingCases: SclTest.TestCases<ListingCase> = {
		'signal held by a vendor LNode beside a signal of a native one → only the native signal listed':
			{
				sourceXml: /* xml */ `
					<SCL ${NS} ${ID}="root">
						<Substation name="S1" ${ID}="substation">
							<Function name="F1" ${ID}="function">
								<LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="native-lnode">
									<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
										<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
											<eIEC61850-6-100:SourceRef input="Trip" ${ID}="native-signal"/>
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
								<Private type="vendor" ${ID}="payload">
									<vendor:LNode iedName="None" lnClass="PTRC" lnInst="1" ${ID}="vendor-lnode">
										<eIEC61850-6-100:LNodeInputs ${ID}="vendor-inputs">
											<eIEC61850-6-100:SourceRef input="Trip" ${ID}="vendor-signal"/>
										</eIEC61850-6-100:LNodeInputs>
									</vendor:LNode>
								</Private>
							</Function>
						</Substation>
					</SCL>`,
				expectedSignals: ['native-signal'],
			},

		'vendor signal in a vendor Private under a native LNode → only the native signal listed': {
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="substation">
						<Function name="F1" ${ID}="function">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="native-lnode">
								<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
									<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" ${ID}="native-signal"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
								<Private type="vendor" ${ID}="payload">
									<vendor:SourceRef input="Other" ${ID}="vendor-signal"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
				</SCL>`,
			expectedSignals: ['native-signal'],
		},

		'native LNode held by a vendor element → its signal not listed': {
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="substation">
						<Function name="F1" ${ID}="function">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="native-lnode">
								<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
									<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" ${ID}="native-signal"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
						<Private type="vendor" ${ID}="payload">
							<vendor:Function name="F2" ${ID}="vendor-function">
								<LNode iedName="None" lnClass="PTRC" lnInst="1" ${ID}="held-lnode">
									<Private type="eIEC61850-6-100" ${ID}="held-extension">
										<eIEC61850-6-100:LNodeInputs ${ID}="held-inputs">
											<eIEC61850-6-100:SourceRef input="Trip" ${ID}="held-signal"/>
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</vendor:Function>
						</Private>
					</Substation>
				</SCL>`,
			expectedSignals: ['native-signal'],
		},
	}

	async function actOnListing({ testCase, source }: SclTest.ActParams<ListingCase>): Promise<void> {
		const dataflows = await all(source.query)
		const signals = dataflows.flatMap((dataflow) =>
			dataflow.kind === 'specified' ? [dataflow.signal.id] : [],
		)
		expect(signals).toEqual(testCase.expectedSignals)
	}

	runSclTestCases.withoutExport({ testCases: listingCases, act: actOnListing })

	const danglingCases: SclTest.TestCases<DanglingCase> = {
		'ExtRef naming by lnUuid only a vendor LN → its lnUuid dangling': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="substation">
						<Function name="F1" ${ID}="function">
							<LNode iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="receiver">
								<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
									<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" extRefUuid="${EXT_REF_UUID}" ${ID}="signal"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED name="P1" ${ID}="ied-p1">
						<AccessPoint name="AP1" ${ID}="ap-p1">
							<Server ${ID}="server-p1">
								<LDevice inst="LD0" ${ID}="ld-p1">
									<!-- no native logical node carries the uuid -->
									<Private type="vendor" ${ID}="payload">
										<vendor:LN lnClass="PTRC" inst="1" uuid="${SENDER_LN_UUID}" ${ID}="vendor-ln"/>
									</Private>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<IED name="B1" ${ID}="ied-b1">
						<AccessPoint name="AP1" ${ID}="ap-b1">
							<Server ${ID}="server-b1">
								<LDevice inst="LD0" ${ID}="ld-b1">
									<LN lnClass="XCBR" inst="1" ${ID}="ln-b1">
										<Inputs ${ID}="ied-inputs">
											<ExtRef uuid="${EXT_REF_UUID}" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" lnUuid="${SENDER_LN_UUID}" ${ID}="ext-ref"/>
										</Inputs>
									</LN>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			expectedAttributes: ['lnUuid'],
		},

		'SourceRef naming by resourceUuid only a vendor resource → its resourceUuid dangling': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="substation">
						<Function name="F1" ${ID}="function">
							<Private type="vendor" ${ID}="payload">
								<vendor:ProcessResource name="PR1" uuid="${RESOURCE_UUID}" ${ID}="vendor-resource"/>
							</Private>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="receiver">
								<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
									<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" resourceUuid="${RESOURCE_UUID}" ${ID}="signal"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
				</SCL>`,
			expectedAttributes: ['resourceUuid'],
		},
	}

	async function actOnDangling({
		testCase,
		source,
	}: SclTest.ActParams<DanglingCase>): Promise<void> {
		const dataflow = await ofSourceRef(source.query, { ref: SIGNAL })
		const attributes = dataflow.implementation.dangling.map((link) => link.attribute)
		expect(attributes).toEqual(testCase.expectedAttributes)
	}

	runSclTestCases.withoutExport({ testCases: danglingCases, act: actOnDangling })
})
