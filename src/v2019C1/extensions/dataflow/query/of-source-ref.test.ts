import { assertParity } from './__tests__/assert-parity'
import {
	assertDataflow,
	MAPPED_INTO_B1_AND_P1,
	MAPPED_INTO_B1_ONLY,
	functionTemplateWithSourceRef,
	BOUND_EXT_REF,
	buildScd,
	iedNameB1ByAccessPoint,
	SECOND_ACCESS_POINT_OF_B1,
	CLIENT_LN_IHMI_OF_B1,
	ihmiOfAccessPointWithExtRef,
	reportControlBlockWith,
	EXT_REF_BY_CONTROL_BLOCK_NAMES,
	EXT_REF_BY_REPORT,
	gooseControlBlock,
	IED_NAME_B2,
	iedNameB1,
	EXT_REF_BY_CONTROL_BLOCK_UUID,
	GOOSE_CONTROL_BLOCK_WITHOUT_UUID,
	expectedSignalSide,
	DUPLICATE_SENDER_LNODE,
	ggioWithExtRef,
	PROCESS_RESOURCE,
	logicalNodeWithExtRef,
	NOT_IMPLEMENTED,
	REFS,
	REPORT_CONTROL_BLOCK,
	RECEIVER_LNODE,
	SENDER_LNODE,
	SHARED_NAME_CONTROL_BLOCKS,
	SENDER_LNODE_IN_B1,
	SHARED_ADDRESS_EXT_REFS,
	SENDER_LNODE_WITHOUT_UUID,
	SENDER_SPEC_NAMING,
	sourceRef,
	UNBOUND_EXT_REF,
	withoutLnUuid,
	xcbrWithExtRef,
	xcbrWithExtRefs,
} from './__tests__/dataflow-fixture'
import { ofSourceRef } from './of-source-ref'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { ExpectedDataflow } from './__tests__/dataflow-fixture.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase &
	ExpectedDataflow & {
		/** The SourceRef the case asks about; the receiver's by default. */
		signal?: Scl.Ref<'SourceRef'>
	}

const act: Parameters<typeof runSclTestCases.withoutExport<TestCase>>[0]['act'] = async ({
	source,
	testCase,
}) => {
	const ref = testCase.signal ?? REFS.sourceRef
	const dataflow = await ofSourceRef(source.query, { ref })
	assertDataflow({ dataflow, expected: testCase })
	await assertParity({ query: source.query, signal: ref })
}

describe('ofSourceRef', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'SourceRef with no source and no extRef → open, unimplemented, unallocated': {
			sourceXml: buildScd({ signals: sourceRef() }),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: {},
			}),
			expectedImplementation: NOT_IMPLEMENTED,
		},
		'SourceRef naming its source by sourceLNodeUuid and sourceDoName → connected, inter-ied': {
			sourceXml: buildScd({
				signals: sourceRef('sourceLNodeUuid="uuid-lnode-sender" sourceDoName="Op"'),
			}),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: {
					state: 'connected',
					other: { lnode: REFS.senderLNode, doName: 'Op' },
					allocation: 'inter-ied',
					mappedIeds: MAPPED_INTO_B1_AND_P1,
				},
			}),
		},
		'SourceRef naming its ExtRef by extRefUuid → implemented, bound, in B1': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(BOUND_EXT_REF),
			}),
			expectedImplementation: {
				state: 'implemented',
				element: REFS.extRef,
				binding: 'bound',
				ln: REFS.xcbr,
				ied: REFS.iedB1,
			},
		},
		'SourceRef naming an ExtRef that is not in the document → implemented, no element, dangling': {
			allowIncoherentReferences: 'the signal names an ExtRef the document does not hold',
			sourceXml: buildScd({ signals: sourceRef('extRefUuid="uuid-missing-ext-ref"') }),
			expectedImplementation: {
				...NOT_IMPLEMENTED,
				state: 'implemented',
				dangling: [
					{ element: REFS.sourceRef, attribute: 'extRefUuid', value: 'uuid-missing-ext-ref' },
				],
			},
		},
		'ExtRef naming its control block by srcCBUuid → control block, publisher, registration by IEDName':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
				}),
				expectedImplementation: {
					controlBlock: REFS.gcb1,
					publisher: REFS.iedP1,
					registration: { element: REFS.iedNameB1, names: 'ap' },
				},
			},
		'ExtRef of a Report service naming a ReportControl with a ClientLN → registration by logical node':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_REPORT),
					controlBlocks: REPORT_CONTROL_BLOCK,
				}),
				expectedImplementation: {
					controlBlock: REFS.rcb1,
					publisher: REFS.iedP1,
					registration: { element: REFS.clientLnB1, names: 'ln' },
				},
			},
		'GOOSE control block naming another IED only → control block, no registration': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
				controlBlocks: gooseControlBlock(IED_NAME_B2),
			}),
			expectedImplementation: {
				controlBlock: REFS.gcb1,
				publisher: REFS.iedP1,
				registration: undefined,
			},
		},
		'SourceRef of a GOOSE service between two LNodes mapped into one IED → same-ied, service kept':
			{
				sourceXml: buildScd({
					senderLNode: SENDER_LNODE_IN_B1,
					signals: sourceRef(
						'sourceLNodeUuid="uuid-lnode-sender" sourceDoName="Op" service="GOOSE"',
					),
					receiverLogicalNodes: `${xcbrWithExtRef()}${logicalNodeWithExtRef({ lnClass: 'GGIO', lnId: 'ln-ggio', uuid: 'uuid-ggio' })}`,
				}),
				expectedSignalSide: expectedSignalSide({
					signal: REFS.sourceRef,
					direction: 'input',
					specification: {
						state: 'connected',
						service: 'GOOSE',
						other: { lnode: REFS.senderLNode, doName: 'Op' },
						allocation: 'same-ied',
						mappedIeds: MAPPED_INTO_B1_ONLY,
					},
				}),
			},
		'SourceRef naming a source LNode that is not in the document → connected, no other, dangling': {
			allowIncoherentReferences: 'the signal names an LNode the document does not hold',
			sourceXml: buildScd({
				signals: sourceRef('sourceLNodeUuid="uuid-missing-lnode" sourceDoName="Op"'),
			}),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: { state: 'connected' },
			}),
			expectedImplementation: {
				dangling: [
					{ element: REFS.sourceRef, attribute: 'sourceLNodeUuid', value: 'uuid-missing-lnode' },
				],
			},
		},
		'ExtRef naming its logical node and control block by uuids the document lacks → dangling lnUuid and srcCBUuid':
			{
				allowIncoherentReferences: 'the ExtRef names elements the document does not hold',
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(
						'uuid="uuid-ext-ref" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" lnUuid="uuid-missing-ln" serviceType="GOOSE" srcCBUuid="uuid-missing-cb"',
					),
				}),
				expectedImplementation: {
					controlBlock: undefined,
					dangling: [
						{ element: REFS.extRef, attribute: 'lnUuid', value: 'uuid-missing-ln' },
						{ element: REFS.extRef, attribute: 'srcCBUuid', value: 'uuid-missing-cb' },
					],
				},
			},
		'IEDName naming B1 and its logical device → registration by logical device': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
				controlBlocks: gooseControlBlock(iedNameB1('ldInst="LD0"')),
			}),
			expectedImplementation: {
				registration: { element: REFS.iedNameB1, names: 'ld' },
			},
		},
		'IEDName naming B1 and its logical node → registration by logical node': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
				controlBlocks: gooseControlBlock(iedNameB1('ldInst="LD0" lnClass="XCBR" lnInst="1"')),
			}),
			expectedImplementation: {
				registration: { element: REFS.iedNameB1, names: 'ln' },
			},
		},
		'IEDName naming B1 and another logical device → no registration': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
				controlBlocks: gooseControlBlock(iedNameB1('ldInst="LD1"')),
			}),
			expectedImplementation: {
				registration: undefined,
			},
		},
		'SourceRef of an LNode of a function template → open as written, unallocated, unimplemented': {
			sourceXml: buildScd({ templates: functionTemplateWithSourceRef() }),
			signal: REFS.templateSourceRef,
			expectedSignalSide: expectedSignalSide({
				signal: REFS.templateSourceRef,
				direction: 'input',
				specification: {
					holder: REFS.templateLNode,
					mappedIeds: { holder: undefined, other: undefined },
				},
			}),
			expectedImplementation: NOT_IMPLEMENTED,
		},
		'SourceRef naming its data object and data attribute by companions → both read from them': {
			sourceXml: buildScd({
				signals: sourceRef(
					'sourceLNodeUuid="uuid-lnode-sender" sourceDoName="Op" sourceDaName="general"',
				),
			}),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: {
					state: 'connected',
					other: { lnode: REFS.senderLNode, doName: 'Op', daName: 'general' },
					allocation: 'inter-ied',
					mappedIeds: MAPPED_INTO_B1_AND_P1,
				},
			}),
		},
		'SourceRef with no companion, its source path carrying DO.DA → data read from the path': {
			sourceXml: buildScd({
				senderContent: SENDER_SPEC_NAMING,
				signals: sourceRef('source="S1/F1/PTRC1.Op.general"'),
			}),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: {
					state: 'connected',
					other: { lnode: REFS.senderLNode, doName: 'Op', daName: 'general' },
					allocation: 'inter-ied',
					mappedIeds: MAPPED_INTO_B1_AND_P1,
				},
			}),
		},
		'SourceRef naming its source LNode only, no data → other without data': {
			sourceXml: buildScd({ signals: sourceRef('sourceLNodeUuid="uuid-lnode-sender"') }),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: {
					state: 'connected',
					other: { lnode: REFS.senderLNode },
					allocation: 'inter-ied',
					mappedIeds: MAPPED_INTO_B1_AND_P1,
				},
			}),
		},
		'SourceRef naming a process resource that is not in the document → dangling resourceUuid': {
			allowIncoherentReferences: 'the signal names a process resource the document does not hold',
			sourceXml: buildScd({ signals: sourceRef('resourceUuid="uuid-missing-resource"') }),
			expectedImplementation: {
				dangling: [
					{ element: REFS.sourceRef, attribute: 'resourceUuid', value: 'uuid-missing-resource' },
				],
			},
		},
		'SourceRef naming a process resource of the document → not dangling': {
			sourceXml: buildScd({
				functionExtras: PROCESS_RESOURCE,
				signals: sourceRef('resourceUuid="uuid-pr1"'),
			}),
			expectedImplementation: { dangling: [] },
		},
	}

	runSclTestCases.withoutExport<TestCase>({ testCases, act })
})

/**
 * The reference hooks give every element a path or names point at the uuid its referrer then names
 * it by: a document written without them (no hooks) is the one that holds a signal, or an ExtRef,
 * naming by path or by names only.
 */
describe('ofSourceRef — names written without their uuid', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'SourceRef naming its source by path only → connected, inter-ied': {
			sourceXml: buildScd({
				senderLNode: SENDER_LNODE_WITHOUT_UUID,
				senderContent: SENDER_SPEC_NAMING,
				signals: sourceRef('source="S1/F1/PTRC1.Op"'),
			}),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: {
					state: 'connected',
					other: { lnode: REFS.senderLNode, doName: 'Op' },
					allocation: 'inter-ied',
					mappedIeds: MAPPED_INTO_B1_AND_P1,
				},
			}),
		},
		'SourceRef naming its ExtRef by the full address, in a proxy LN of the IED → implemented': {
			sourceXml: buildScd({
				signals: sourceRef('extRefAddr="B1/LD0/GGIO1.Trip"'),
				receiverLogicalNodes: `${xcbrWithExtRef()}${ggioWithExtRef(UNBOUND_EXT_REF)}`,
			}),
			expectedImplementation: {
				state: 'implemented',
				element: REFS.extRef,
				ln: REFS.ggio,
				ied: REFS.iedB1,
			},
		},
		'SourceRef naming its ExtRef by the address inside the IED → implemented': {
			sourceXml: buildScd({
				signals: sourceRef('extRefAddr="LD0/XCBR1.Trip"'),
				receiverLogicalNodes: xcbrWithExtRef(UNBOUND_EXT_REF),
			}),
			expectedImplementation: {
				state: 'implemented',
				element: REFS.extRef,
				ln: REFS.xcbr,
				ied: REFS.iedB1,
			},
		},
		'SourceRef naming its ExtRef by its internal address alone → implemented in the mapped LN': {
			sourceXml: buildScd({
				signals: sourceRef('extRefAddr="@Trip"'),
				receiverLogicalNodes: `${ggioWithExtRef(UNBOUND_EXT_REF, 'ext-ref-proxy')}${xcbrWithExtRef(UNBOUND_EXT_REF)}`,
			}),
			expectedImplementation: {
				state: 'implemented',
				element: REFS.extRef,
				ln: REFS.xcbr,
				ied: REFS.iedB1,
			},
		},
		'ExtRef naming its control block by its names → control block, publisher, registration by IEDName':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_NAMES),
					controlBlocks: GOOSE_CONTROL_BLOCK_WITHOUT_UUID,
				}),
				expectedImplementation: {
					controlBlock: REFS.gcb1,
					publisher: REFS.iedP1,
					registration: { element: REFS.iedNameB1, names: 'ap' },
				},
			},
		'LNodes mapped to their logical nodes by names only → inter-ied': {
			sourceXml: buildScd({
				senderLNode: withoutLnUuid(SENDER_LNODE),
				receiverLNode: withoutLnUuid(RECEIVER_LNODE),
				signals: sourceRef('sourceLNodeUuid="uuid-lnode-sender" sourceDoName="Op"'),
			}),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: {
					state: 'connected',
					other: { lnode: REFS.senderLNode, doName: 'Op' },
					allocation: 'inter-ied',
					mappedIeds: MAPPED_INTO_B1_AND_P1,
				},
			}),
		},
		'receiver LNode assigned to no IED → connected, unallocated': {
			sourceXml: buildScd({
				receiverLNode: 'iedName="None" lnClass="XCBR" lnInst="1" uuid="uuid-lnode-receiver"',
				signals: sourceRef('sourceLNodeUuid="uuid-lnode-sender" sourceDoName="Op"'),
			}),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: {
					state: 'connected',
					other: { lnode: REFS.senderLNode, doName: 'Op' },
					allocation: 'unallocated',
					mappedIeds: { holder: undefined, other: REFS.iedP1 },
				},
			}),
		},
		'ExtRef without an internal address, its logical node addressed → not named by that path': {
			sourceXml: buildScd({
				signals: sourceRef('extRefAddr="B1/LD0/XCBR1"'),
				receiverLogicalNodes: xcbrWithExtRef(
					'iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op"',
				),
			}),
			expectedImplementation: {
				...NOT_IMPLEMENTED,
				state: 'implemented',
				dangling: [{ element: REFS.sourceRef, attribute: 'extRefAddr', value: 'B1/LD0/XCBR1' }],
			},
		},
		'ExtRef naming a control block by a name two kinds of control block share → none chosen': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(
					'uuid="uuid-ext-ref" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" srcLDInst="LD0" srcCBName="shared"',
				),
				controlBlocks: SHARED_NAME_CONTROL_BLOCKS,
			}),
			expectedImplementation: { controlBlock: undefined, publisher: undefined },
		},
		'two ExtRefs sharing an internal address, the SourceRef naming its data attribute → the ExtRef of that attribute':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefAddr="B1/LD0/XCBR1.Trip" pDA="q"'),
					receiverLogicalNodes: xcbrWithExtRefs(SHARED_ADDRESS_EXT_REFS),
				}),
				expectedImplementation: {
					state: 'implemented',
					element: { tagName: 'ExtRef', id: 'ext-ref-q' },
					ln: REFS.xcbr,
				},
			},
		'two ExtRefs sharing an internal address, the SourceRef naming no data attribute → no element, no dangling':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefAddr="B1/LD0/XCBR1.Trip"'),
					receiverLogicalNodes: xcbrWithExtRefs(SHARED_ADDRESS_EXT_REFS),
				}),
				expectedImplementation: { ...NOT_IMPLEMENTED, state: 'implemented' },
			},
		'IEDName naming by uuid another access point of the subscriber IED → registration by access point':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
					receiverAccessPoints: SECOND_ACCESS_POINT_OF_B1,
					controlBlocks: gooseControlBlock(
						iedNameB1ByAccessPoint({ apRef: 'AP2', apUuid: 'uuid-ap2-b1' }),
					),
				}),
				expectedImplementation: { registration: { element: REFS.iedNameB1, names: 'ap' } },
			},
		'IEDName naming by uuid the access point holding the ExtRef → registration by access point': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
				controlBlocks: gooseControlBlock(
					iedNameB1ByAccessPoint({ apRef: 'AP1', apUuid: 'uuid-ap1-b1' }),
				),
			}),
			expectedImplementation: { registration: { element: REFS.iedNameB1, names: 'ap' } },
		},
		'IEDName carrying only the uuid of the subscriber logical node → registration by logical node':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
					controlBlocks: gooseControlBlock(iedNameB1('lnUuid="uuid-xcbr"')),
				}),
				expectedImplementation: { registration: { element: REFS.iedNameB1, names: 'ln' } },
			},
		'IEDName whose logical device uuid names the subscriber logical device, its ldInst another → registration by logical device':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
					controlBlocks: gooseControlBlock(iedNameB1('ldInst="LD9" ldUuid="uuid-ld-b1"')),
				}),
				expectedImplementation: { registration: { element: REFS.iedNameB1, names: 'ld' } },
			},
		'ClientLN of an access point logical node naming its IED, access point and logical node → registration by logical node':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(),
					receiverAccessPointContent: ihmiOfAccessPointWithExtRef(EXT_REF_BY_REPORT),
					controlBlocks: reportControlBlockWith(CLIENT_LN_IHMI_OF_B1),
				}),
				expectedImplementation: {
					controlBlock: REFS.rcb1,
					registration: { element: REFS.clientLnB1, names: 'ln' },
				},
			},
		'two LNodes of one path, the SourceRef naming it by path → the last one': {
			sourceXml: buildScd({
				senderLNode: SENDER_LNODE_WITHOUT_UUID,
				senderContent: SENDER_SPEC_NAMING,
				functionExtras: DUPLICATE_SENDER_LNODE,
				signals: sourceRef('source="S1/F1/PTRC1.Op"'),
			}),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: {
					state: 'connected',
					other: { lnode: REFS.duplicateSenderLNode, doName: 'Op' },
					allocation: 'inter-ied',
					mappedIeds: MAPPED_INTO_B1_AND_P1,
				},
			}),
		},
		'SourceRef naming its source and its ExtRef by addresses naming nothing → both dangling': {
			sourceXml: buildScd({
				signals: sourceRef('source="S1/F1/PTRC9.Op" extRefAddr="B1/LD0/XCBR9.Trip"'),
			}),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.sourceRef,
				direction: 'input',
				specification: { state: 'connected' },
			}),
			expectedImplementation: {
				...NOT_IMPLEMENTED,
				state: 'implemented',
				dangling: [
					{ element: REFS.sourceRef, attribute: 'source', value: 'S1/F1/PTRC9.Op' },
					{ element: REFS.sourceRef, attribute: 'extRefAddr', value: 'B1/LD0/XCBR9.Trip' },
				],
			},
		},
		'SourceRef naming its ExtRef by the bare internal address → implemented in the mapped LN': {
			sourceXml: buildScd({
				signals: sourceRef('extRefAddr="Trip"'),
				receiverLogicalNodes: `${ggioWithExtRef(UNBOUND_EXT_REF, 'ext-ref-proxy')}${xcbrWithExtRef(UNBOUND_EXT_REF)}`,
			}),
			expectedImplementation: {
				state: 'implemented',
				element: REFS.extRef,
				ln: REFS.xcbr,
			},
		},
		'SourceRef naming an ExtRef whose internal address holds dots, by its full address → implemented':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefAddr="B1/LD0/XCBR1.GGIO1.Ind3.stVal"'),
					receiverLogicalNodes: xcbrWithExtRef('intAddr="GGIO1.Ind3.stVal"'),
				}),
				expectedImplementation: { state: 'implemented', element: REFS.extRef, ln: REFS.xcbr },
			},
		'SourceRef naming an ExtRef whose internal address holds dots, by that address alone → implemented':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefAddr="@GGIO1.Ind3.stVal"'),
					receiverLogicalNodes: xcbrWithExtRef('intAddr="GGIO1.Ind3.stVal"'),
				}),
				expectedImplementation: { state: 'implemented', element: REFS.extRef, ln: REFS.xcbr },
			},
	}

	runSclTestCases.withoutExport<TestCase>({ testCases, act, hooks: {} })
})
