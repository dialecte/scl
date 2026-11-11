/// <reference types="vite/client" />

import FlowWithoutServiceBetweenLnodesOfAXml from './fixtures/flow-without-service-between-lnodes-of-a.xml?raw'
import GooseFlowBetweenLnodesOfAXml from './fixtures/goose-flow-between-lnodes-of-a.xml?raw'
import GooseFlowByPathBetweenLnodesOfAXml from './fixtures/goose-flow-by-path-between-lnodes-of-a.xml?raw'
import ReportFlowBetweenLnodesOfAXml from './fixtures/report-flow-between-lnodes-of-a.xml?raw'
import SvFlowBetweenLnodesOfAXml from './fixtures/sv-flow-between-lnodes-of-a.xml?raw'
import TargetHoldingSubstationS1Xml from './fixtures/target-holding-substation-s1.xml?raw'
import WiredFlowBetweenLnodesOfAXml from './fixtures/wired-flow-between-lnodes-of-a.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

type RefusalCase = SclTest.BaseXmlTestCase & { refusal?: string }

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyIsd = /* xml */ `<SCL ${ns} ${id}="empty-isd"/>`

const EXPORT = {
	iedRef: { tagName: 'IED', id: 'ied-a' },
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'later-binding',
	internalService: true,
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'engineer',
} as const

/** The receiving input, in later-binding form: nothing of the control block it was subscribed to. */
const OPEN_INPUT =
	'//default:LN[@lnClass="RREC"]/default:Inputs/default:ExtRef[@intAddr="BlockReclose"][@pDO="Op"][not(@iedName or @lnUuid or @srcCBName or @srcCBUuid)]'

describe('a flow between two LNodes of the IED is written as an internal service', () => {
	async function act({
		source,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function exportIsd(tx) {
			return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query })
		})
		return { assertOn: 'target' }
	}

	const testCases: SclTest.TestCases = {
		'X reports to Y over rcb1 of A, A its only client → Internal, no link to the input, rcb1 and its data set without the client':
			{
				sourceXml: ReportFlowBetweenLnodesOfAXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LNode[@lnClass="RREC"]/default:Private/v2019C1:LNodeInputs/v2019C1:SourceRef[@input="BlockReclose"][@service="Internal"][@sourceLNodeUuid="80000000-0000-4000-8000-000000000001"][not(@extRefUuid or @extRefAddr)]',
					OPEN_INPUT,
					'//default:LN0/default:ReportControl[@name="rcb1"][@datSet="DS1"][@uuid="60000000-0000-4000-8000-0000000000a1"]',
					'//default:LN0/default:DataSet[@name="DS1"]/default:FCDA[@lnClass="PTRC"][@doName="Op"]',
				],
				unexpectedQueries: ['//default:ClientLN'],
			},
		'X samples to Y over smv1 of A, A its only receiver → Internal, no link to the input, smv1 and its data set without the receiver':
			{
				sourceXml: SvFlowBetweenLnodesOfAXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LNode[@lnClass="RREC"]/default:Private/v2019C1:LNodeInputs/v2019C1:SourceRef[@input="BlockReclose"][@service="Internal"][@sourceLNodeUuid="80000000-0000-4000-8000-000000000001"][not(@extRefUuid or @extRefAddr)]',
					OPEN_INPUT,
					'//default:LN0/default:SampledValueControl[@name="smv1"][@datSet="DS1"][@uuid="60000000-0000-4000-8000-0000000000a1"]',
					'//default:LN0/default:DataSet[@name="DS1"]/default:FCDA[@lnClass="PTRC"][@doName="Op"]',
				],
				unexpectedQueries: ['//default:IEDName'],
			},
		'X publishing to Y over gcb1, the flow naming X by its path only → Internal, no link to the input':
			{
				sourceXml: GooseFlowByPathBetweenLnodesOfAXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LNode[@lnClass="RREC"]/default:Private/v2019C1:LNodeInputs/v2019C1:SourceRef[@input="BlockReclose"][@service="Internal"][@source][not(@extRefUuid or @extRefAddr)]',
				],
			},
		'X feeding Y inside A with no service specified → Internal': {
			sourceXml: FlowWithoutServiceBetweenLnodesOfAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:LNode[@lnClass="RREC"]/default:Private/v2019C1:LNodeInputs/v2019C1:SourceRef[@input="BlockReclose"][@service="Internal"][@sourceLNodeUuid="80000000-0000-4000-8000-000000000001"]',
			],
		},
		'X wired to Y inside A → the flow stays wired': {
			sourceXml: WiredFlowBetweenLnodesOfAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:LNode[@lnClass="RREC"]/default:Private/v2019C1:LNodeInputs/v2019C1:SourceRef[@input="BlockReclose"][@service="Wired"][@sourceLNodeUuid="80000000-0000-4000-8000-000000000001"]',
			],
			unexpectedQueries: ['//v2019C1:SourceRef[@service="Internal"]'],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the project keeps the service it specifies', () => {
	async function act({ source, target, testCase }: SclTest.ActParams<RefusalCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const sourceBefore = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
		const targetBefore = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
		const outcome = await target
			.transaction(async function exportIsd(tx) {
				const stagedBefore = [...tx.getStagedOperations()]
				const refused = await tx.lifecycle.extract
					.ied({ ...EXPORT, sourceQuery: source.query })
					.then(
						() => undefined,
						(error: unknown) => error,
					)
				return { refused, stagedBefore, stagedAfter: [...tx.getStagedOperations()] }
			})
			.catch((error: unknown) => ({ refused: error, stagedBefore: [], stagedAfter: [] }))
		const sourceAfter = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
		expect(sourceAfter).toEqual(sourceBefore)
		if (testCase.refusal) {
			expect(toDialecteError(outcome.refused)?.key).toBe(testCase.refusal)
			expect(outcome.stagedAfter).toEqual(outcome.stagedBefore)
			const targetAfter = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
			expect(targetAfter).toEqual(targetBefore)
		} else expect(outcome.refused).toBeUndefined()
		const [sourceRef] = await source.query.getRecordsByTagName('SourceRef')
		const service = await source.query.getAttribute(sourceRef, { name: 'service' })
		expect(service).toBe('GOOSE')
	}

	const testCases: SclTest.TestCases<RefusalCase> = {
		'GOOSE flow between LNodes of A exported with the internal service → the project unchanged, still GOOSE':
			{
				sourceXml: GooseFlowBetweenLnodesOfAXml,
				targetXml: emptyIsd,
			},
		'GOOSE flow between LNodes of A, target already holding a substation → refused, project and target unchanged':
			{
				sourceXml: GooseFlowBetweenLnodesOfAXml,
				targetXml: TargetHoldingSubstationS1Xml,
				refusal: 'EXTRACTION_TARGET_NOT_EMPTY',
			},
	}

	runSclTestCases.withoutExport({ testCases, act })
})
