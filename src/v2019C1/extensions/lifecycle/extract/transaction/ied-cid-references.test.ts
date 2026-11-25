/// <reference types="vite/client" />

import RealIedWithClientsAndSupervisionXml from './fixtures/cid-real-ied-with-clients-and-supervision.xml?raw'
import RealIedWithInputsBoundElsewhereXml from './fixtures/cid-real-ied-with-inputs-bound-elsewhere.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CidExtractParams } from './ied.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	options?: Partial<CidExtractParams>
	/** Warnings the result holds, each equal to one returned warning. */
	expectedWarnings?: Record<string, unknown>[]
	/** Records no returned warning names as its source. */
	unwarnedSources?: { tagName: string; id: string }[]
	assertOn?: 'target' | 'source'
}

const CID = {
	fileType: 'CID',
	iedRef: { tagName: 'IED', id: 'selected-ied' },
	interactingIeds: 'none',
	tool: 'TEST',
	who: 'test',
} as const satisfies Omit<CidExtractParams, 'sourceQuery'>

const emptyTarget = /* xml */ `<SCL xmlns="http://www.iec.ch/61850/2003/SCL" xmlns:dev="http://dialecte.dev/XML/DEV" dev:db-id="empty-target" version="2007" revision="C" release="5"/>`

const selected = '/default:SCL/default:IED[@name="Selected"]'
const ptoc = `${selected}//default:LN[@lnClass="PTOC"]`
/** What an input or output bound by names only to a logical node of Other loses. */
const outputBoundToOther = ['lnUuid', 'iedName', 'ldInst', 'lnClass', 'lnInst', 'doName']

/** What an input bound by names, data attribute and control block to Other loses. */
const boundToOther = [
	'lnUuid',
	'iedName',
	'ldInst',
	'lnClass',
	'lnInst',
	'doName',
	'daName',
	'serviceType',
	'srcCBUuid',
	'srcLDInst',
	'srcLNClass',
	'srcCBName',
]

const unbound =
	'[not(@iedName)][not(@ldInst)][not(@prefix)][not(@lnClass)][not(@lnInst)][not(@doName)][not(@daName)][not(@lnUuid)][not(@serviceType)][not(@srcLDInst)][not(@srcPrefix)][not(@srcLNClass)][not(@srcLNInst)][not(@srcCBName)][not(@srcCBUuid)]'

function extRef(id: string): { tagName: string; id: string } {
	return { tagName: 'ExtRef', id }
}

describe('extract IED as CID - inputs and outputs bound to an IED the file does not hold', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'system input of LN0 bound to Other, no internal address -> left out with the Inputs it leaves empty':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [`${selected}//default:LN0`],
				unexpectedQueries: [
					`${selected}//default:LN0/default:Inputs`,
					'//default:ExtRef[@desc="system input from other"]',
				],
				expectedWarnings: [
					{ code: 'input-removed', source: extRef('extref-SystemInput'), iedName: 'Other' },
				],
			},
		'device input bound to Other -> internal address, expected data, description and uuid kept, nothing of its source':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="BlockIn"][@desc="device input bound to other"][@pLN="GGIO"][@pDO="Ind"][@pDA="stVal"][@pServT="GOOSE"][@uuid="70000000-0000-4000-8000-000000000001"]${unbound}`,
				],
				expectedWarnings: [
					{
						code: 'input-unbound',
						source: extRef('extref-BlockIn'),
						iedName: 'Other',
						attributes: boundToOther,
					},
				],
			},
		'system poll and two device inputs of one data object bound to Other -> the poll left out, each device input kept unbound':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="SiblingA"][@pDO="Ind"]${unbound}`,
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="SiblingB"][@pDO="Ind"]${unbound}`,
				],
				unexpectedQueries: ['//default:ExtRef[@desc="system poll of other"]'],
				expectedWarnings: [
					{ code: 'input-removed', source: extRef('extref-SystemPoll'), iedName: 'Other' },
					{
						code: 'input-unbound',
						source: extRef('extref-SiblingA'),
						iedName: 'Other',
						attributes: boundToOther,
					},
					{
						code: 'input-unbound',
						source: extRef('extref-SiblingB'),
						iedName: 'Other',
						attributes: boundToOther,
					},
				],
			},
		'inputs relative to the IED, bound to the IED itself, or not bound -> written as they are, not listed':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="RelativeIn"][@iedName="@"][@ldInst="LD1"][@lnClass="PTOC"][@doName="Op"]`,
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="SelfIn"][@iedName="Selected"][@ldInst="LD1"][@lnClass="PTOC"][@doName="Op"]`,
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="TemplateIn"][@pDO="Ind"][not(@iedName)]`,
				],
				unwarnedSources: [
					extRef('extref-RelativeIn'),
					extRef('extref-SelfIn'),
					extRef('extref-TemplateIn'),
				],
			},
		'device input bound by names to Ghost, an IED the source does not hold -> kept unbound and listed':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="GhostIn"][@pDO="Ind"]${unbound}`,
				],
				expectedWarnings: [
					{
						code: 'input-unbound',
						source: extRef('extref-GhostIn'),
						iedName: 'Ghost',
						attributes: ['iedName', 'ldInst', 'lnClass', 'lnInst', 'doName'],
					},
				],
			},
		'outputs to Other with and without an internal address -> both kept, their binding gone': {
			sourceXml: RealIedWithInputsBoundElsewhereXml,
			targetXml: emptyTarget,
			expectedQueries: [
				`${ptoc}/default:Outputs[count(default:ExtCtrl)=2]`,
				`${ptoc}/default:Outputs/default:ExtCtrl[@intAddr="TripOut"][@pDO="Ind"][@apRef="AP1"][@desc="device output to other"][not(@iedName)][not(@ldInst)][not(@lnClass)][not(@doName)]`,
				`${ptoc}/default:Outputs/default:ExtCtrl[@desc="output to other without address"][@apRef="AP1"][not(@intAddr)][not(@iedName)][not(@ldInst)][not(@lnClass)][not(@doName)]`,
			],
			expectedWarnings: [
				{
					code: 'input-unbound',
					source: { tagName: 'ExtCtrl', id: 'extctrl-TripOut' },
					iedName: 'Other',
					attributes: outputBoundToOther,
				},
				{
					code: 'input-unbound',
					source: { tagName: 'ExtCtrl', id: 'extctrl-OutputWithoutAddress' },
					iedName: 'Other',
					attributes: outputBoundToOther,
				},
			],
		},
		'device input bound to Other without a description -> kept unbound, listed as missing its description':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="NoDescIn"][@pDO="Ind"]${unbound}`,
				],
				expectedWarnings: [
					{ code: 'input-incomplete', source: extRef('extref-NoDescIn'), missing: ['desc'] },
					{
						code: 'input-unbound',
						source: extRef('extref-NoDescIn'),
						iedName: 'Other',
						attributes: outputBoundToOther,
					},
				],
			},
		'inputs and outputs reduced in the CID -> the source still holds them bound': {
			sourceXml: RealIedWithInputsBoundElsewhereXml,
			targetXml: emptyTarget,
			assertOn: 'source',
			expectedQueries: [
				'//default:LN0/default:Inputs/default:ExtRef[@desc="system input from other"][@iedName="Other"][@srcCBName="OtherGoose"]',
				'//default:ExtRef[@intAddr="BlockIn"][@iedName="Other"][@serviceType="GOOSE"][@srcCBName="OtherGoose"]',
				'//default:ExtCtrl[@intAddr="TripOut"][@iedName="Other"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extract IED as CID - receivers, report clients, associations and supervision naming another IED', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'receivers and report clients naming Other, client references left at their default -> kept and listed':
			{
				sourceXml: RealIedWithClientsAndSupervisionXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${selected}//default:GSEControl[@name="GooseOut"]/default:IEDName[text()="Other"][@ldInst="OLD"][@lnClass="GGIO"][@apUuid="30000000-0000-4000-8000-000000000003"][@lnUuid="50000000-0000-4000-8000-000000000004"]`,
					`${selected}//default:GSEControl[@name="GooseOut"]/default:IEDName[text()="Selected"]`,
					`${selected}//default:ReportControl[@name="Rpt"]/default:RptEnabled/default:ClientLN[@iedName="Other"][@lnClass="IHMI"][@lnUuid="50000000-0000-4000-8000-000000000006"]`,
					`${selected}//default:ReportControl[@name="Rpt"]/default:RptEnabled/default:ClientLN[@iedName="Selected"]`,
				],
				expectedWarnings: [
					{
						code: 'ied-reference-dangling',
						source: { tagName: 'IEDName', id: 'iedname-other' },
						iedName: 'Other',
					},
					{
						code: 'ied-reference-dangling',
						source: { tagName: 'ClientLN', id: 'clientln-other' },
						iedName: 'Other',
					},
				],
				unwarnedSources: [
					{ tagName: 'IEDName', id: 'iedname-self' },
					{ tagName: 'ClientLN', id: 'clientln-self' },
				],
			},
		'receivers and report clients naming Other, absent entries cleaned -> those naming Other left out, those naming the IED kept':
			{
				sourceXml: RealIedWithClientsAndSupervisionXml,
				targetXml: emptyTarget,
				options: { clientRefs: 'cleanAbsent' },
				expectedQueries: [
					`${selected}//default:GSEControl[@name="GooseOut"][count(default:IEDName)=1]/default:IEDName[text()="Selected"]`,
					`${selected}//default:ReportControl[@name="Rpt"]/default:RptEnabled[count(default:ClientLN)=1]/default:ClientLN[@iedName="Selected"]`,
				],
				expectedWarnings: [
					{
						code: 'ied-reference-left-out',
						source: { tagName: 'IEDName', id: 'iedname-other' },
						iedName: 'Other',
					},
					{
						code: 'ied-reference-left-out',
						source: { tagName: 'ClientLN', id: 'clientln-other' },
						iedName: 'Other',
					},
				],
			},
		'an association and a key distribution entry naming Other, absent entries cleaned -> both kept and listed':
			{
				sourceXml: RealIedWithClientsAndSupervisionXml,
				targetXml: emptyTarget,
				options: { clientRefs: 'cleanAbsent' },
				expectedQueries: [
					`${selected}/default:AccessPoint/default:Server/default:Association[@iedName="Other"][@associationID="A1"]`,
					`${selected}/default:KDC[@iedName="Other"][@apName="AP1"]`,
				],
				expectedWarnings: [
					{
						code: 'ied-reference-dangling',
						source: { tagName: 'Association', id: 'association-other' },
						iedName: 'Other',
					},
					{
						code: 'ied-reference-dangling',
						source: { tagName: 'KDC', id: 'kdc-other' },
						iedName: 'Other',
					},
				],
			},
		'an association and a key distribution entry naming Other, client references left at their default -> both kept and listed':
			{
				sourceXml: RealIedWithClientsAndSupervisionXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${selected}/default:AccessPoint/default:Server/default:Association[@iedName="Other"][@associationID="A1"]`,
					`${selected}/default:KDC[@iedName="Other"][@apName="AP1"]`,
				],
				expectedWarnings: [
					{
						code: 'ied-reference-dangling',
						source: { tagName: 'Association', id: 'association-other' },
						iedName: 'Other',
					},
					{
						code: 'ied-reference-dangling',
						source: { tagName: 'KDC', id: 'kdc-other' },
						iedName: 'Other',
					},
				],
			},
		'two LGOS supervising the own GOOSE of the IED by the same reference -> both kept, neither listed':
			{
				sourceXml: RealIedWithClientsAndSupervisionXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${selected}//default:LN[@lnClass="LGOS"][@inst="2"]/default:DOI/default:DAI/default:Val[text()="SelectedLD1/LLN0.GooseOut"]`,
					`${selected}//default:LN[@lnClass="LGOS"][@inst="3"]/default:DOI/default:DAI/default:Val[text()="SelectedLD1/LLN0.GooseOut"]`,
				],
				unwarnedSources: [
					{ tagName: 'LN', id: 'lgos-self' },
					{ tagName: 'LN', id: 'lgos-self-again' },
				],
			},
		'an LGOS supervising Other, an LGOS supervising the IED itself and an LSVS naming no control block -> all kept, the two not supervising the IED listed':
			{
				sourceXml: RealIedWithClientsAndSupervisionXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${selected}//default:LN[@lnClass="LGOS"][@inst="1"]/default:DOI[@name="GoCBRef"]/default:DAI[@name="setSrcRef"]/default:Val[text()="OtherOLD/LLN0.OtherGoose"]`,
					`${selected}//default:LN[@lnClass="LGOS"][@inst="2"]/default:DOI[@name="GoCBRef"]/default:DAI[@name="setSrcRef"]/default:Val[text()="SelectedLD1/LLN0.GooseOut"]`,
					`${selected}//default:LN[@lnClass="LSVS"][@inst="1"]/default:DOI[@name="SvCBRef"]/default:DAI[@name="setSrcRef"]/default:Val[text()="GhostLD/LLN0.Samples"]`,
				],
				expectedWarnings: [
					{
						code: 'supervision-source-absent',
						source: { tagName: 'LN', id: 'lgos-other' },
						reference: 'OtherOLD/LLN0.OtherGoose',
					},
					{
						code: 'supervision-source-absent',
						source: { tagName: 'LN', id: 'lsvs-ghost' },
						reference: 'GhostLD/LLN0.Samples',
					},
				],
				unwarnedSources: [{ tagName: 'LN', id: 'lgos-self' }],
			},
	}

	runSclTestCases.withExport({ testCases, act })
})

async function act({
	source,
	target,
	testCase,
}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	const exported = target.transaction(async function exportCid(tx) {
		return tx.lifecycle.extract.ied({ ...CID, ...testCase.options, sourceQuery: source.query })
	})
	await expect(exported).resolves.toMatchObject({ fileName: 'Selected.cid' })
	const { warnings } = await exported
	for (const warning of testCase.expectedWarnings ?? []) {
		expect(warnings).toContainEqual(warning)
	}
	for (const unwarned of testCase.unwarnedSources ?? []) {
		expect(warnings).not.toContainEqual(expect.objectContaining({ source: unwarned }))
	}
	return { assertOn: testCase.assertOn ?? 'target' }
}

describe('extract IED as CID - an input naming its source by a uuid only', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'device input holding only the uuid of a logical node no document holds -> kept, the uuid cleared, listed':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="UuidOnlyIn"][@pDO="Ind"]${unbound}`,
				],
				expectedWarnings: [
					{ code: 'input-unbound', source: extRef('extref-UuidOnlyIn'), attributes: ['lnUuid'] },
				],
			},
	}

	/** The input UuidOnlyIn given a logical node uuid no document holds: a state no file of the fixture can hold. */
	async function actOnUuidOnlyInput(
		params: SclTest.ActParams<TestCase>,
	): Promise<SclTest.ActResult> {
		await params.source.transaction(async function nameByUuidOnly(tx) {
			await tx.update(
				{ tagName: 'ExtRef', id: 'extref-UuidOnlyIn' },
				{ attributes: { lnUuid: '50000000-0000-4000-8000-000000000099' } },
			)
		})
		return act(params)
	}

	runSclTestCases.withExport({ testCases, act: actOnUuidOnlyInput })
})
