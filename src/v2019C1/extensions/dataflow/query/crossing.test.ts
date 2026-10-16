import {
	assertDataflows,
	BOUND_EXT_CTRL,
	buildScd,
	controlRef,
	EXT_CTRL_ON_GGIO_OF_B1,
	POLL_EXT_REF,
	xcbrWithExtCtrl,
	sourceRef,
	xcbrWithExtRef,
	GOOSE_CONTROL_BLOCK_IN_B1,
	logicalNodeWithExtRef,
	REFS,
	SENDER_LNODE_IN_B1,
	sourceRefs,
	xcbrWithExtRefs,
} from './__tests__/dataflow-fixture'
import { crossing } from './crossing'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { ExpectedEntry } from './__tests__/dataflow-fixture.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	ieds: readonly Scl.Ref<'IED'>[]
	expected: readonly ExpectedEntry[]
}

const FROM_P1 = { id: 'source-ref-from-p1', tagName: 'SourceRef' } as const
const INSIDE_B1 = { id: 'source-ref-inside-b1', tagName: 'SourceRef' } as const

const unimplementedFromP1ToB1 = sourceRef('sourceLNodeUuid="uuid-lnode-sender" sourceDoName="Op"')

describe('crossing', () => {
	/** One flow from `P1` to `B1` and one inside `B1`, both implemented. */
	const oneAcrossOneInside = buildScd({
		receiverControlBlocks: GOOSE_CONTROL_BLOCK_IN_B1,
		signals: sourceRefs([
			{ id: FROM_P1.id, attributes: 'extRefUuid="uuid-ext-ref-from-p1" pDA="stVal"' },
			{ id: INSIDE_B1.id, attributes: 'extRefUuid="uuid-ext-ref-inside-b1" pDA="q"' },
		]),
		receiverLogicalNodes: xcbrWithExtRefs([
			{
				id: 'ext-ref-from-p1',
				attributes:
					'uuid="uuid-ext-ref-from-p1" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" serviceType="GOOSE" srcCBUuid="uuid-gcb1" pDA="stVal"',
			},
			{
				id: 'ext-ref-inside-b1',
				attributes:
					'uuid="uuid-ext-ref-inside-b1" intAddr="Trip" iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" doName="Op" serviceType="GOOSE" srcCBUuid="uuid-gcb2" pDA="q"',
			},
		]),
	})

	const testCases: SclTest.TestCases<TestCase> = {
		'one flow from P1 to B1 and one inside B1, asking for B1 → the flow from P1 only': {
			sourceXml: oneAcrossOneInside,
			ieds: [REFS.iedB1],
			expected: [{ kind: 'specified', signal: FROM_P1 }],
		},
		'one flow from P1 to B1 and one inside B1, asking for P1 and B1 → none': {
			sourceXml: oneAcrossOneInside,
			ieds: [REFS.iedP1, REFS.iedB1],
			expected: [],
		},
		'ExtRef naming no control block implementing a SourceRef, asking for B1 → listed, no publisher':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				ieds: [REFS.iedB1],
				expected: [{ kind: 'specified', signal: REFS.sourceRef }],
			},
		'unimplemented SourceRef between an LNode mapped to P1 and one mapped to B1, asking for B1 → listed':
			{
				sourceXml: buildScd({ signals: unimplementedFromP1ToB1 }),
				ieds: [REFS.iedB1],
				expected: [{ kind: 'specified', signal: REFS.sourceRef, element: undefined }],
			},
		'unimplemented SourceRef between an LNode mapped to P1 and one mapped to B1, asking for both → none':
			{
				sourceXml: buildScd({ signals: unimplementedFromP1ToB1 }),
				ieds: [REFS.iedP1, REFS.iedB1],
				expected: [],
			},
		'unimplemented SourceRef between two LNodes mapped to B1, asking for B1 → none': {
			sourceXml: buildScd({
				senderLNode: SENDER_LNODE_IN_B1,
				signals: unimplementedFromP1ToB1,
				receiverLogicalNodes: `${xcbrWithExtRef()}${logicalNodeWithExtRef({ lnClass: 'GGIO', lnId: 'ln-ggio', uuid: 'uuid-ggio' })}`,
			}),
			ieds: [REFS.iedB1],
			expected: [],
		},
		'ExtCtrl of B1 controlling a logical node of B1, asking for B1 → none': {
			sourceXml: buildScd({
				senderLNode: SENDER_LNODE_IN_B1,
				signals: controlRef(
					'controlledLNodeUuid="uuid-lnode-sender" controlledDoName="Op" extCtrlUuid="uuid-ext-ctrl"',
				),
				receiverLogicalNodes: `${xcbrWithExtCtrl(EXT_CTRL_ON_GGIO_OF_B1)}${logicalNodeWithExtRef({ lnClass: 'GGIO', lnId: 'ln-ggio', uuid: 'uuid-ggio' })}`,
			}),
			ieds: [REFS.iedB1],
			expected: [],
		},
		'ExtCtrl of B1 controlling data of P1, asking for P1 and B1 → none': {
			sourceXml: buildScd({
				signals: controlRef('extCtrlUuid="uuid-ext-ctrl"'),
				receiverLogicalNodes: xcbrWithExtCtrl(BOUND_EXT_CTRL),
			}),
			ieds: [REFS.iedP1, REFS.iedB1],
			expected: [],
		},
		'ExtCtrl of B1 controlling data of P1, asking for B1 → listed': {
			sourceXml: buildScd({
				signals: controlRef('extCtrlUuid="uuid-ext-ctrl"'),
				receiverLogicalNodes: xcbrWithExtCtrl(BOUND_EXT_CTRL),
			}),
			ieds: [REFS.iedB1],
			expected: [{ kind: 'specified', signal: REFS.controlRef, element: REFS.extCtrl }],
		},
		'ExtRef of B1 polling a signal of P1, asking for P1 and B1 → none': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(POLL_EXT_REF),
			}),
			ieds: [REFS.iedP1, REFS.iedB1],
			expected: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		hooks: {},
		act: async ({ source, testCase }) => {
			const dataflows = await crossing(source.query, { ieds: testCase.ieds })
			assertDataflows({ dataflows, expected: testCase.expected })
		},
	})
})
