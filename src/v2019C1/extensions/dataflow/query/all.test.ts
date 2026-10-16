import {
	assertDataflows,
	BOUND_EXT_REF,
	buildScd,
	xcbrWithExtRefs,
	functionTemplateWithSourceRef,
	iedB2WithExtRef,
	logicalNodeWithExtRef,
	sourceRef,
	subscribedExtRef,
	REFS,
	SUBSCRIBED_EXT_REF,
	sourceRefs,
	xcbrWithExtRef,
} from './__tests__/dataflow-fixture'
import { all } from './all'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { ExpectedEntry } from './__tests__/dataflow-fixture.types'
import type { SclTest } from '@/v2019C1/test'

const SAME_SOURCE = 'sourceLNodeUuid="uuid-lnode-sender" sourceDoName="Op"'

const SIGNAL_OF_P1_BY_GOOSE =
	'intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" serviceType="GOOSE" srcCBUuid="uuid-gcb1"'

type TestCase = SclTest.BaseXmlTestCase & {
	expected: readonly ExpectedEntry[]
}

describe('all', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two SourceRefs naming one ExtRef → two specified entries with that element, in document order':
			{
				sourceXml: buildScd({
					signals: sourceRefs([
						{
							id: 'source-ref-stval',
							attributes: `${SAME_SOURCE} extRefUuid="uuid-ext-ref" pDA="stVal"`,
						},
						{ id: 'source-ref-q', attributes: `${SAME_SOURCE} extRefUuid="uuid-ext-ref" pDA="q"` },
					]),
					receiverLogicalNodes: xcbrWithExtRef(BOUND_EXT_REF),
				}),
				expected: [
					{
						kind: 'specified',
						signal: { tagName: 'SourceRef', id: 'source-ref-stval' },
						element: REFS.extRef,
					},
					{
						kind: 'specified',
						signal: { tagName: 'SourceRef', id: 'source-ref-q' },
						element: REFS.extRef,
					},
				],
			},
		'ExtRef naming a control block, no SourceRef naming it → one implementation-only entry, subscribed':
			{
				sourceXml: buildScd({ receiverLogicalNodes: xcbrWithExtRef(SUBSCRIBED_EXT_REF) }),
				expected: [
					{
						kind: 'implementation-only',
						element: REFS.extRef,
						implementation: {
							state: 'implemented',
							element: REFS.extRef,
							binding: 'subscribed',
							ln: REFS.xcbr,
							ied: REFS.iedB1,
							controlBlock: REFS.gcb1,
							publisher: REFS.iedP1,
							registration: { element: REFS.iedNameB1, names: 'ap' },
							dangling: [],
						},
					},
				],
			},
		'ExtRef naming no control block, no SourceRef naming it → not a dataflow': {
			sourceXml: buildScd({ receiverLogicalNodes: xcbrWithExtRef('intAddr="Trip"') }),
			expected: [],
		},
		'a SourceRef naming the second of three subscribed ExtRefs → its entry first, then the two others in document order':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref-b"'),
					receiverLogicalNodes: [
						logicalNodeWithExtRef({
							lnClass: 'XCBR',
							lnId: 'ln-xcbr',
							uuid: 'uuid-xcbr',
							extRef: subscribedExtRef('uuid-ext-ref-a'),
							extRefId: 'ext-ref-a',
						}),
						logicalNodeWithExtRef({
							lnClass: 'GGIO',
							lnId: 'ln-ggio',
							extRef: subscribedExtRef('uuid-ext-ref-b'),
							extRefId: 'ext-ref-b',
						}),
						logicalNodeWithExtRef({
							lnClass: 'MMXU',
							lnId: 'ln-mmxu',
							extRef: subscribedExtRef('uuid-ext-ref-c'),
							extRefId: 'ext-ref-c',
						}),
					].join(''),
				}),
				expected: [
					{
						kind: 'specified',
						signal: REFS.sourceRef,
						element: { tagName: 'ExtRef', id: 'ext-ref-b' },
					},
					{ kind: 'implementation-only', element: { tagName: 'ExtRef', id: 'ext-ref-a' } },
					{ kind: 'implementation-only', element: { tagName: 'ExtRef', id: 'ext-ref-c' } },
				],
			},
		'a SourceRef of a function template → listed, unimplemented': {
			sourceXml: buildScd({ templates: functionTemplateWithSourceRef() }),
			expected: [{ kind: 'specified', signal: REFS.templateSourceRef, element: undefined }],
		},
		'ExtRef of the same signal and control block as the ExtRef a SourceRef names, no SourceRef naming it → no entry of its own':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRefs([
						{
							id: 'ext-ref',
							attributes: `${SIGNAL_OF_P1_BY_GOOSE} daName="stVal" uuid="uuid-ext-ref"`,
						},
						{
							id: 'ext-ref-q',
							attributes: `${SIGNAL_OF_P1_BY_GOOSE} daName="q" uuid="uuid-ext-ref-q"`,
						},
					]),
				}),
				expected: [{ kind: 'specified', signal: REFS.sourceRef, element: REFS.extRef }],
			},
		'ExtRef of B1 linked by a SourceRef, an ExtRef of B2 of the same signal and control block → B2 stays implementation-only':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRefs([
						{ id: 'ext-ref', attributes: `${SIGNAL_OF_P1_BY_GOOSE} uuid="uuid-ext-ref"` },
					]),
					extraIeds: iedB2WithExtRef(`${SIGNAL_OF_P1_BY_GOOSE} uuid="uuid-ext-ref-b2"`),
				}),
				expected: [
					{ kind: 'specified', signal: REFS.sourceRef, element: REFS.extRef },
					{ kind: 'implementation-only', element: REFS.extRefB2 },
				],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const dataflows = await all(source.query)
			assertDataflows({ dataflows, expected: testCase.expected })
		},
	})
})

/** The hooks fill the uuid of a signal named by its names (and the other way): without them an ExtRef names it by one alone. */
describe('all — signals named by different attributes', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'sibling ExtRef naming its signal by lnUuid only, the linked one by names → no entry of its own':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRefs([
						{
							id: 'ext-ref',
							attributes: `${SIGNAL_OF_P1_BY_GOOSE} daName="stVal" uuid="uuid-ext-ref"`,
						},
						{
							id: 'ext-ref-q',
							attributes:
								'uuid="uuid-ext-ref-q" intAddr="Trip" lnUuid="uuid-ptrc" doName="Op" daName="q" serviceType="GOOSE" srcCBUuid="uuid-gcb1"',
						},
					]),
				}),
				expected: [{ kind: 'specified', signal: REFS.sourceRef, element: REFS.extRef }],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		hooks: {},
		act: async ({ source, testCase }) => {
			const dataflows = await all(source.query)
			assertDataflows({ dataflows, expected: testCase.expected })
		},
	})
})
