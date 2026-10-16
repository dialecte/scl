import {
	assertDataflow,
	BOUND_EXT_CTRL,
	UNBOUND_EXT_CTRL,
	buildScd,
	controlRef,
	expectedSignalSide,
	NOT_IMPLEMENTED,
	REFS,
	xcbrWithExtCtrl,
} from './__tests__/dataflow-fixture'
import { ofControlRef } from './of-control-ref'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { ExpectedDataflow } from './__tests__/dataflow-fixture.types'
import type { SclTest } from '@/v2019C1/test'

describe('ofControlRef', () => {
	type TestCase = SclTest.BaseXmlTestCase & ExpectedDataflow

	const testCases: SclTest.TestCases<TestCase> = {
		'ControlRef with no controlled data and no extCtrl → open, unimplemented, unallocated': {
			sourceXml: buildScd({ signals: controlRef() }),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.controlRef,
				direction: 'output',
				specification: {},
			}),
			expectedImplementation: NOT_IMPLEMENTED,
		},
		'ControlRef naming its controlled LNode by controlledLNodeUuid and controlledDoName → connected, inter-ied':
			{
				sourceXml: buildScd({
					signals: controlRef('controlledLNodeUuid="uuid-lnode-sender" controlledDoName="Op"'),
				}),
				expectedSignalSide: expectedSignalSide({
					signal: REFS.controlRef,
					direction: 'output',
					specification: {
						state: 'connected',
						other: { lnode: REFS.senderLNode, doName: 'Op' },
						allocation: 'inter-ied',
					},
				}),
			},
		'ControlRef naming its ExtCtrl by extCtrlUuid → implemented, bound, no control block': {
			sourceXml: buildScd({
				signals: controlRef('extCtrlUuid="uuid-ext-ctrl"'),
				receiverLogicalNodes: xcbrWithExtCtrl(BOUND_EXT_CTRL),
			}),
			expectedImplementation: {
				state: 'implemented',
				element: REFS.extCtrl,
				binding: 'bound',
				ln: REFS.xcbr,
				ied: REFS.iedB1,
				controlBlock: undefined,
				publisher: undefined,
				registration: undefined,
			},
		},
		'ControlRef naming its controlled data by path only → the whole qualifier is the data object': {
			sourceXml: buildScd({ signals: controlRef('controlled="S1/F1/PTRC1.Pos.Oper"') }),
			expectedSignalSide: expectedSignalSide({
				signal: REFS.controlRef,
				direction: 'output',
				specification: {
					state: 'connected',
					other: { lnode: REFS.senderLNode, doName: 'Pos.Oper' },
					allocation: 'inter-ied',
				},
			}),
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const dataflow = await ofControlRef(source.query, { ref: REFS.controlRef })
			assertDataflow({ dataflow, expected: testCase })
		},
	})
})

/**
 * The reference hooks give every element an address names the uuid the signal then names it by: a
 * document written without them is the one that holds a ControlRef naming by address only.
 */
describe('ofControlRef — names written without their uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & ExpectedDataflow

	const testCases: SclTest.TestCases<TestCase> = {
		'ControlRef naming its ExtCtrl by the full address → implemented, bound': {
			sourceXml: buildScd({
				signals: controlRef('extCtrlAddr="B1/LD0/XCBR1.Close"'),
				receiverLogicalNodes: xcbrWithExtCtrl(UNBOUND_EXT_CTRL),
			}),
			expectedImplementation: {
				state: 'implemented',
				element: REFS.extCtrl,
				binding: 'bound',
				ln: REFS.xcbr,
				ied: REFS.iedB1,
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		hooks: {},
		act: async ({ source, testCase }) => {
			const dataflow = await ofControlRef(source.query, { ref: REFS.controlRef })
			assertDataflow({ dataflow, expected: testCase })
		},
	})
})
