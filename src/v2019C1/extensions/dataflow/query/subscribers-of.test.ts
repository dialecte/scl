import {
	assertDataflows,
	buildScd,
	EXT_REF_BY_REPORT_IN_LN,
	EXT_REF_BY_REPORT,
	GOOSE_CONTROL_BLOCK,
	REPORT_CONTROL_BLOCK,
	EXT_REF_BY_CONTROL_BLOCK_UUID,
	gooseControlBlock,
	IED_NAME_B2,
	iedB2WithExtRef,
	iedNameB1,
	REFS,
	sourceRef,
	subscribedExtRef,
	xcbrWithExtRef,
} from './__tests__/dataflow-fixture'
import { subscribersOf } from './subscribers-of'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Registration } from '../dataflow.types'
import type { ExpectedEntry } from './__tests__/dataflow-fixture.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	controlBlock: Scl.Ref<'GSEControl' | 'SampledValueControl' | 'ReportControl'>
	expectedRegistrations: readonly Registration[]
	expectedElements: readonly Scl.Ref<'ExtRef'>[]
	expectedDataflows: readonly ExpectedEntry[]
}

describe('subscribersOf', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two IEDName and two ExtRefs, one naming gcb1 by uuid and one by names → both of each': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref"'),
				receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_CONTROL_BLOCK_UUID),
				controlBlocks: gooseControlBlock(`${iedNameB1('ldInst="LD0"')}${IED_NAME_B2}`),
				extraIeds: iedB2WithExtRef(subscribedExtRef('uuid-ext-ref-b2')),
			}),
			controlBlock: REFS.gcb1,
			expectedRegistrations: [
				{ element: REFS.iedNameB1, names: 'ld' },
				{ element: REFS.iedNameB2, names: 'ap' },
			],
			expectedElements: [REFS.extRef, REFS.extRefB2],
			expectedDataflows: [
				{ kind: 'specified', signal: REFS.sourceRef, element: REFS.extRef },
				{ kind: 'implementation-only', element: REFS.extRefB2 },
			],
		},
		'gcb1 with no IEDName, ExtRefs naming no control block → no registration, no ExtRef, no dataflow':
			{
				sourceXml: buildScd({ controlBlocks: gooseControlBlock('') }),
				controlBlock: REFS.gcb1,
				expectedRegistrations: [],
				expectedElements: [],
				expectedDataflows: [],
			},
		'IEDName naming B1, its logical device and its logical node → registration by logical node': {
			sourceXml: buildScd({
				controlBlocks: gooseControlBlock(iedNameB1('ldInst="LD0" lnClass="XCBR" lnInst="1"')),
			}),
			controlBlock: REFS.gcb1,
			expectedRegistrations: [{ element: REFS.iedNameB1, names: 'ln' }],
			expectedElements: [],
			expectedDataflows: [],
		},
		'ReportControl held by a logical node other than LN0, a ClientLN, an ExtRef naming it → resolved, registered by logical node':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_REPORT_IN_LN),
					controlBlocks: '',
					senderLogicalNodeContent: REPORT_CONTROL_BLOCK,
				}),
				controlBlock: REFS.rcb1,
				expectedRegistrations: [{ element: REFS.clientLnB1, names: 'ln' }],
				expectedElements: [REFS.extRef],
				expectedDataflows: [
					{
						kind: 'specified',
						signal: REFS.sourceRef,
						element: REFS.extRef,
						implementation: { controlBlock: REFS.rcb1, publisher: REFS.iedP1 },
					},
				],
			},
		'ReportControl with a ClientLN, an ExtRef naming it → registration by logical node, its ExtRef and dataflow':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref"'),
					receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_REPORT),
					controlBlocks: REPORT_CONTROL_BLOCK,
				}),
				controlBlock: REFS.rcb1,
				expectedRegistrations: [{ element: REFS.clientLnB1, names: 'ln' }],
				expectedElements: [REFS.extRef],
				expectedDataflows: [{ kind: 'specified', signal: REFS.sourceRef, element: REFS.extRef }],
			},
		'ExtRef naming rcb1 while the block asked for is gcb1 → not an element of gcb1': {
			sourceXml: buildScd({
				receiverLogicalNodes: xcbrWithExtRef(EXT_REF_BY_REPORT),
				controlBlocks: `${GOOSE_CONTROL_BLOCK}${REPORT_CONTROL_BLOCK}`,
			}),
			controlBlock: REFS.gcb1,
			expectedRegistrations: [{ element: REFS.iedNameB1, names: 'ap' }],
			expectedElements: [],
			expectedDataflows: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		hooks: {},
		act: async ({ source, testCase }) => {
			const { registrations, elements, dataflows } = await subscribersOf(source.query, {
				controlBlock: testCase.controlBlock,
			})
			expect(registrations).toEqual(testCase.expectedRegistrations)
			expect(elements).toEqual(testCase.expectedElements)
			assertDataflows({ dataflows, expected: testCase.expectedDataflows })
		},
	})
})

describe('subscribersOf — a reference that is not a control block of the document', () => {
	type ErrorTestCase = SclTest.BaseXmlTestCase & { controlBlock: TestCase['controlBlock'] }

	const testCases: SclTest.TestCases<ErrorTestCase> = {
		'GSEControl that is not in the document → refused': {
			sourceXml: buildScd(),
			controlBlock: { tagName: 'GSEControl', id: 'gcb-missing' },
		},
	}

	runSclTestCases.withoutExport<ErrorTestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const refusal = await subscribersOf(source.query, {
				controlBlock: testCase.controlBlock,
			}).catch((error: unknown) => toDialecteError(error))
			expect(refusal).toMatchObject({ key: 'ELEMENT_NOT_FOUND' })
		},
	})
})
