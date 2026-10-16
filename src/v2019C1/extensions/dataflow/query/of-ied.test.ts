import {
	assertDataflows,
	BOUND_EXT_CTRL,
	buildScd,
	controlRef,
	EXT_REF_WITHOUT_CONTROL_BLOCK,
	POLL_EXT_REF,
	xcbrWithExtCtrl,
	ptrcInputsWithExtRef,
	subscribedExtRef,
	EXT_REF_BY_CONTROL_BLOCK_UUID,
	REFS,
	sourceRef,
	xcbrWithExtRef,
} from './__tests__/dataflow-fixture'
import { ofIed } from './of-ied'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { ExpectedEntry } from './__tests__/dataflow-fixture.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	ied: Scl.Ref<'IED'>
	expectedPublished: readonly ExpectedEntry[]
	expectedSubscribed: readonly ExpectedEntry[]
}

describe('ofIed', () => {
	const unimplementedFromP1ToB1 = buildScd({
		signals: sourceRef('sourceLNodeUuid="uuid-lnode-sender" sourceDoName="Op"'),
	})
	const publishedByP1SubscribedByB1 = {
		sourceXml: buildScd({
			signals: sourceRef('extRefUuid="uuid-ext-ref"'),
			receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
		}),
	}
	const sourceRefDataflow: ExpectedEntry = {
		kind: 'specified',
		signal: REFS.sourceRef,
		element: REFS.extRef,
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'dataflow from P1 to B1, asking for P1 → published, nothing subscribed': {
			...publishedByP1SubscribedByB1,
			ied: REFS.iedP1,
			expectedPublished: [sourceRefDataflow],
			expectedSubscribed: [],
		},
		'dataflow from P1 to B1, asking for B1 → subscribed, nothing published': {
			...publishedByP1SubscribedByB1,
			ied: REFS.iedB1,
			expectedPublished: [],
			expectedSubscribed: [sourceRefDataflow],
		},
		'dataflow whose control block and ExtRef are both in P1 → in both lists': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(),
				senderLogicalNodeContent: ptrcInputsWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
			}),
			ied: REFS.iedP1,
			expectedPublished: [sourceRefDataflow],
			expectedSubscribed: [sourceRefDataflow],
		},
		'ExtRef naming a control block, no SourceRef naming it, asking for B1 → subscribed': {
			sourceXml: buildScd({ receiverLogicalNodes: xcbrWithExtRef(subscribedExtRef()) }),
			ied: REFS.iedB1,
			expectedPublished: [],
			expectedSubscribed: [{ kind: 'implementation-only', element: REFS.extRef }],
		},
		'ExtRef of B1 polling a signal of P1, asking for P1 → published': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(POLL_EXT_REF),
			}),
			ied: REFS.iedP1,
			expectedPublished: [sourceRefDataflow],
			expectedSubscribed: [],
		},
		'ExtRef of B1 naming a signal of P1 and no control block, asking for P1 → published': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(EXT_REF_WITHOUT_CONTROL_BLOCK),
			}),
			ied: REFS.iedP1,
			expectedPublished: [sourceRefDataflow],
			expectedSubscribed: [],
		},
		'ExtCtrl of B1 controlling data of P1, asking for P1 → published, nothing subscribed': {
			sourceXml: buildScd({
				signals: controlRef('extCtrlUuid="uuid-ext-ctrl"'),
				receiverLogicalNodes: xcbrWithExtCtrl(BOUND_EXT_CTRL),
			}),
			ied: REFS.iedP1,
			expectedPublished: [{ kind: 'specified', signal: REFS.controlRef, element: REFS.extCtrl }],
			expectedSubscribed: [],
		},
		'ExtCtrl of B1 controlling data of P1, asking for B1 → subscribed, nothing published': {
			sourceXml: buildScd({
				signals: controlRef('extCtrlUuid="uuid-ext-ctrl"'),
				receiverLogicalNodes: xcbrWithExtCtrl(BOUND_EXT_CTRL),
			}),
			ied: REFS.iedB1,
			expectedPublished: [],
			expectedSubscribed: [{ kind: 'specified', signal: REFS.controlRef, element: REFS.extCtrl }],
		},
		'unimplemented SourceRef between an LNode mapped to P1 and one mapped to B1, asking for B1 → subscribed':
			{
				sourceXml: unimplementedFromP1ToB1,
				ied: REFS.iedB1,
				expectedPublished: [],
				expectedSubscribed: [{ kind: 'specified', signal: REFS.sourceRef }],
			},
		'unimplemented SourceRef between an LNode mapped to P1 and one mapped to B1, asking for P1 → published':
			{
				sourceXml: unimplementedFromP1ToB1,
				ied: REFS.iedP1,
				expectedPublished: [{ kind: 'specified', signal: REFS.sourceRef }],
				expectedSubscribed: [],
			},
		'ExtRef of B1 naming the logical node of P1 by its uuid only, no control block, asking for P1 → published':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(
						'uuid="uuid-ext-ref" intAddr="Trip" lnUuid="uuid-ptrc" doName="Op" serviceType="Poll"',
					),
				}),
				ied: REFS.iedP1,
				expectedPublished: [sourceRefDataflow],
				expectedSubscribed: [],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		hooks: {},
		act: async ({ source, testCase }) => {
			const { published, subscribed } = await ofIed(source.query, { ref: testCase.ied })
			assertDataflows({ dataflows: published, expected: testCase.expectedPublished })
			assertDataflows({ dataflows: subscribed, expected: testCase.expectedSubscribed })
		},
	})
})
