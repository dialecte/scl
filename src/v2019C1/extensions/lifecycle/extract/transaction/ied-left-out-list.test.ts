/// <reference types="vite/client" />

import GooseFlowBetweenLnodesOfAXml from './fixtures/goose-flow-between-lnodes-of-a.xml?raw'
import GooseFlowByPathBetweenLnodesOfAXml from './fixtures/goose-flow-by-path-between-lnodes-of-a.xml?raw'
import ProjectWithEveryKindLeftOutXml from './fixtures/project-with-every-kind-left-out.xml?raw'
import ServicesDeclaringNoSupervisionCapacityXml from './fixtures/services-declaring-no-supervision-capacity.xml?raw'
import ServicesDeclaringSupervisionCapacityXml from './fixtures/services-declaring-supervision-capacity.xml?raw'
import ServicesDeclaringSvSupervisionOnlyXml from './fixtures/services-declaring-sv-supervision-only.xml?raw'
import SupervisionLnWithAnInputXml from './fixtures/supervision-ln-with-an-input.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ExtractWarning } from './extract.types'
import type { SclTest } from '@/v2019C1/test'

type WarningCase = SclTest.BaseXmlTestCase & { expectedWarnings: ExtractWarning[] }

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

describe('the IED part keeps its control blocks without itself as receiver, and no supervision capability', () => {
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
		'gcb1 of A publishing X to Y only, A its only receiver → gcb1 and its data set written, no receiver':
			{
				sourceXml: GooseFlowBetweenLnodesOfAXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LN0/default:GSEControl[@name="gcb1"][@datSet="DS1"][@uuid="60000000-0000-4000-8000-0000000000a1"]',
					'//default:LN0/default:DataSet[@name="DS1"][count(default:FCDA)=1]/default:FCDA[@lnClass="PTRC"][@doName="Op"][@daName="general"]',
				],
				unexpectedQueries: ['//default:IEDName'],
			},
		'A declaring the supervision of GOOSE and SV subscriptions → no supervision capability, no supervision LN':
			{
				sourceXml: ServicesDeclaringSupervisionCapacityXml,
				targetXml: emptyIsd,
				expectedQueries: ['/default:SCL/default:IED[@name="A"]'],
				unexpectedQueries: ['//default:SupSubscription', '//default:LN[@lnClass="LGOS"]'],
			},
		'A declaring the supervision of SV subscriptions only → no supervision capability': {
			sourceXml: ServicesDeclaringSvSupervisionOnlyXml,
			targetXml: emptyIsd,
			expectedQueries: ['/default:SCL/default:IED[@name="A"]'],
			unexpectedQueries: ['//default:SupSubscription'],
		},
		'A declaring the supervision of no subscription → the capability written as it is': {
			sourceXml: ServicesDeclaringNoSupervisionCapacityXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'/default:SCL/default:IED[@name="A"]/default:Services/default:SupSubscription[@maxGo="0"][@maxSv="0"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('what the export leaves out is listed once', () => {
	async function act({ source, target, testCase }: SclTest.ActParams<WarningCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const { warnings } = await target.transaction(async function exportIsd(tx) {
			return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query })
		})
		expect(warnings).toHaveLength(testCase.expectedWarnings.length)
		expect(warnings).toEqual(expect.arrayContaining(testCase.expectedWarnings))
	}

	const testCases: SclTest.TestCases<WarningCase> = {
		'A declaring the supervision of GOOSE and SV subscriptions → the capability listed with the supervision LN':
			{
				sourceXml: ServicesDeclaringSupervisionCapacityXml,
				targetXml: emptyIsd,
				expectedWarnings: [
					{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'supervision-ln' } },
					{
						code: 'supervision-left-out',
						source: { tagName: 'SupSubscription', id: 'supervision-capacity' },
					},
				],
			},
		'supervision LN holding an input with no description → only the supervision LN listed': {
			sourceXml: SupervisionLnWithAnInputXml,
			targetXml: emptyIsd,
			expectedWarnings: [
				{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'supervision-ln' } },
			],
		},
		'flow from X to Y inside A naming X by its path only → nothing listed, the link is written': {
			sourceXml: GooseFlowByPathBetweenLnodesOfAXml,
			targetXml: emptyIsd,
			expectedWarnings: [],
		},
		'supervision, receivers of A and of B, a behaviour across A and B, a flow from B, an internal flow → each left-out element listed once':
			{
				sourceXml: ProjectWithEveryKindLeftOutXml,
				targetXml: emptyIsd,
				expectedWarnings: [
					{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'supervision-ln' } },
					{
						code: 'supervision-left-out',
						source: { tagName: 'SupSubscription', id: 'supervision-capacity' },
					},
					{
						code: 'ied-reference-left-out',
						source: { tagName: 'IEDName', id: 'gcb1-receiver-b' },
						iedName: 'B',
					},
					{
						code: 'input-incomplete',
						source: { tagName: 'ExtRef', id: 'input-without-description' },
						missing: ['desc'],
					},
					{
						code: 'process-lnode-left-out',
						source: { tagName: 'LNode', id: 'supervision-lnode' },
						reason: 'target-not-carried',
					},
					{
						code: 'behavior-description-left-out',
						source: { tagName: 'BehaviorDescription', id: 'behaviour-across-a-b' },
						reason: 'partly-mapped',
					},
					{
						code: 'process-reference-cut',
						source: { tagName: 'SourceRef', id: 'flow-b-to-a' },
						attributes: ['source', 'sourceDaName', 'sourceDoName', 'sourceLNodeUuid'],
					},
				],
			},
	}

	runSclTestCases.withoutExport({ testCases, act })
})
