/// <reference types="vite/client" />

import RealIedWithSendersXml from './fixtures/cid-real-ied-with-senders.xml?raw'
import RealIedWithSubstationPartXml from './fixtures/cid-real-ied-with-substation-part.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { CidExtractParams } from './ied.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	options?: Partial<CidExtractParams>
	/** Warnings the result holds, each equal to one returned warning. */
	expectedWarnings?: Record<string, unknown>[]
	/** Records no returned warning names as its source. */
	unwarnedSources?: { tagName: string; id: string }[]
}

const CID = {
	fileType: 'CID',
	iedRef: { tagName: 'IED', id: 'selected-ied' },
	interactingIeds: 'publishers',
	clientRefs: 'cleanAbsent',
	tool: 'TEST',
	who: 'test',
} as const satisfies Omit<CidExtractParams, 'sourceQuery'>

/** The cut of the input specification fed by the LNode of Other. */
const PROCESS_REFERENCE_CUT = {
	code: 'process-reference-cut',
	source: { tagName: 'SourceRef', id: 'source-ref-other' },
	attributes: ['source', 'sourceDoName', 'sourceLNodeUuid'],
}

const emptyTarget = /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="empty-target"/>`

const pub = '/default:SCL/default:IED[@name="Pub"]'
const pub2 = '/default:SCL/default:IED[@name="Pub2"]'
const selected = '/default:SCL/default:IED[@name="Selected"]'

describe('extract IED as CID - with the IEDs sending to it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'Selected subscribes GooseA and GooseB of Pub and polls GGIO1 of Pub2 -> both senders written as partial IEDs marked fix, each with what it sends and its address only':
			{
				sourceXml: RealIedWithSendersXml,
				targetXml: emptyTarget,
				expectedQueries: [
					'/default:SCL[count(default:IED)=4]',
					`${selected}[not(@engRight)]`,
					`${pub}[@engRight="fix"][@uuid="20000000-0000-4000-8000-000000000002"][count(default:AccessPoint)=1]`,
					`${pub}//default:LDevice[@inst="LD1"]/default:LN0[count(*)=5]/default:GSEControl[@name="GooseA"][@datSet="SetA"]`,
					`${pub}//default:LDevice[@inst="LD1"]/default:LN0/default:GSEControl[@name="GooseB"][@datSet="SetB"]`,
					`${pub}//default:LDevice[@inst="LD1"]/default:LN0/default:DataSet[@name="SetA"]/default:FCDA[@ldInst="LD2"][@lnClass="GGIO"]`,
					`${pub}//default:LDevice[@inst="LD2"][count(*)=2]/default:LN[@lnClass="GGIO"][@inst="1"][@uuid="50000000-0000-4000-8000-000000000012"]`,
					`${pub2}[@engRight="fix"]//default:LDevice[@inst="LD1"][count(*)=2]/default:LN[@lnClass="GGIO"][@inst="1"]`,
					'//default:ConnectedAP[@iedName="Pub"][count(default:GSE)=2]/default:Address/default:P[@type="IP"][text()="10.0.0.2"]',
					'//default:ConnectedAP[@iedName="Pub2"]/default:Address/default:P[@type="IP"][text()="10.0.0.3"]',
					'//default:ConnectedAP[@iedName="Selected"]/default:Address',
					'/default:SCL/default:DataTypeTemplates[count(default:LNodeType[@id="GGIO_Type"])=1][count(default:LNodeType[@id="LLN0_Type"])=1][count(default:DOType[@id="SPS_Type"])=1]',
				],
				unexpectedQueries: [
					`${pub}/default:Services`,
					`${pub}//default:GSEControl[@name="GooseC"]`,
					'//default:ConnectedAP[@iedName="Pub"]/default:GSE[@cbName="GooseC"]',
					'//default:IED[@name="Other3"]',
					`${pub}//default:LN0/default:DOI`,
					`${pub}//default:Inputs`,
					`${pub}//default:LN[@lnClass="XCBR"]`,
					`${pub2}//default:LN[@inst="2"]`,
					`${pub2}//default:GSEControl`,
					'//default:LNodeType[@id="XCBR_Type"]',
					'//default:DOType[@id="DPC_Type"]',
				],
				expectedWarnings: [
					{
						code: 'data-set-member-unresolved',
						source: { tagName: 'FCDA', id: 'pub-fcda-absent' },
					},
				],
			},
		'inputs bound to the senders, an LGOS supervising a sent block, an input bound to an IED of no file -> the first kept as they are and not listed, the last reduced':
			{
				sourceXml: RealIedWithSendersXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${selected}//default:ExtRef[@intAddr="FromPub"][@iedName="Pub"][@srcCBName="GooseA"][@serviceType="GOOSE"]`,
					`${selected}//default:ExtRef[@intAddr="FromPubB"][@iedName="Pub"][@srcCBName="GooseB"]`,
					`${selected}//default:ExtRef[@intAddr="FromPub2"][@iedName="Pub2"][@serviceType="Poll"]`,
					`${selected}//default:ExtRef[@intAddr="FromAbsent"][not(@iedName)][not(@ldInst)][not(@doName)]`,
				],
				expectedWarnings: [
					{
						code: 'input-unbound',
						source: { tagName: 'ExtRef', id: 'input-absent' },
						iedName: 'Absent',
						attributes: ['iedName', 'ldInst', 'lnClass', 'lnInst', 'doName'],
					},
				],
				unwarnedSources: [
					{ tagName: 'ExtRef', id: 'input-pub' },
					{ tagName: 'ExtRef', id: 'input-pub-b' },
					{ tagName: 'ExtRef', id: 'input-pub2' },
					{ tagName: 'LN', id: 'lgos-pub' },
					{ tagName: 'ExtRef', id: 'input-relative' },
					{ tagName: 'ExtRef', id: 'input-self' },
				],
			},
		'receivers of the IED naming a sender and an IED of no file, absent entries cleaned -> the sender kept, the other left out':
			{
				sourceXml: RealIedWithSendersXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${selected}//default:GSEControl[@name="GooseOut"][count(default:IEDName)=1]/default:IEDName[text()="Pub"]`,
				],
				expectedWarnings: [
					{
						code: 'ied-reference-left-out',
						source: { tagName: 'IEDName', id: 'receiver-absent' },
						iedName: 'Absent',
					},
				],
				unwarnedSources: [{ tagName: 'IEDName', id: 'receiver-pub' }],
			},
		'blocks of Pub sent to Selected naming Selected and other IEDs as receivers and report clients -> the entries naming Selected kept, the others left out':
			{
				sourceXml: RealIedWithSendersXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${pub}//default:GSEControl[@name="GooseA"][count(default:IEDName)=1]/default:IEDName[text()="Selected"]`,
					`${pub}//default:ReportControl[@name="Rpt"]/default:RptEnabled[count(default:ClientLN)=1]/default:ClientLN[@iedName="Selected"]`,
				],
			},
		'Pub3 on a subnetwork Selected is not on, beside Other3, sending GooseC to an input naming its GGIO2 -> Pub3 written with GooseC, its data set, GGIO1 and GGIO2, its subnetwork with its connection only':
			{
				sourceXml: RealIedWithSendersXml,
				targetXml: emptyTarget,
				expectedQueries: [
					'/default:SCL/default:IED[@name="Pub3"][@engRight="fix"]//default:LN0/default:GSEControl[@name="GooseC"]',
					'/default:SCL/default:IED[@name="Pub3"]//default:LDevice[@inst="LD1"][count(default:LN)=2]/default:LN[@lnClass="GGIO"][@inst="2"]',
					'//default:SubNetwork[@name="Bus2"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Pub3"]/default:GSE[@cbName="GooseC"]',
				],
				unexpectedQueries: ['//default:ConnectedAP[@iedName="Other3"]'],
			},
		'a GOOSE input naming GooseA, a GOOSE and a report block of Pub both named GooseA -> the GOOSE block and its address kept, the report block left out':
			{
				sourceXml: RealIedWithSendersXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${pub}//default:LN0/default:GSEControl[@name="GooseA"]`,
					'//default:ConnectedAP[@iedName="Pub"]/default:GSE[@cbName="GooseA"]',
				],
				unexpectedQueries: [`${pub}//default:LN0/default:ReportControl[@name="GooseA"]`],
			},
		'a report block of Pub2 naming Selected as a client, no input of Selected bound to it -> written with its data set and that client':
			{
				sourceXml: RealIedWithSendersXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${pub2}//default:LN0/default:ReportControl[@name="Rpt2"]/default:RptEnabled/default:ClientLN[@iedName="Selected"]`,
					`${pub2}//default:LN0/default:DataSet[@name="Set2"]`,
				],
			},
		'a report client of the IED naming a sender, absent entries cleaned -> kept': {
			sourceXml: RealIedWithSendersXml,
			targetXml: emptyTarget,
			expectedQueries: [
				`${selected}//default:ReportControl[@name="SelRpt"]/default:RptEnabled/default:ClientLN[@iedName="Pub"]`,
			],
			unwarnedSources: [{ tagName: 'ClientLN', id: 'client-pub' }],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extract IED as CID - with the substation part related to the IED', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'substation part asked -> the frames of the LNodes the IED implements, project names and identifiers, its data specification keeping its mapping, its input specification fed by another IED cut and listed, no LNode of another IED':
			{
				sourceXml: RealIedWithSubstationPartXml,
				targetXml: emptyTarget,
				options: { interactingIeds: 'none', includeSubstation: true },
				expectedQueries: [
					'/default:SCL/default:Substation[@name="S1"]/default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]/default:Function[@name="F1"][count(default:LNode)=1]/default:LNode[@iedName="Selected"][@lnClass="PTOC"][@lnUuid="50000000-0000-4000-8000-000000000002"][@uuid="80000000-0000-4000-8000-0000000000a1"]',
					'//default:LNode[@iedName="Selected"]/default:Private/*[local-name()="DOS"][@name="Op"][@mappedLnUuid="50000000-0000-4000-8000-000000000003"][@mappedDoName="Ind"]',
					'//default:LNode[@iedName="Selected"]//*[local-name()="SourceRef"][@input="Block"][not(@sourceLNodeUuid)]',
				],
				unexpectedQueries: ['//default:LNode[@iedName="Other"]'],
				expectedWarnings: [PROCESS_REFERENCE_CUT],
			},
		'substation part left at its default -> no substation in the file': {
			sourceXml: RealIedWithSubstationPartXml,
			targetXml: emptyTarget,
			options: { interactingIeds: 'none' },
			expectedQueries: ['/default:SCL[count(default:IED)=1]'],
			unexpectedQueries: ['//default:Substation'],
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
	for (const warning of testCase.expectedWarnings ?? []) expect(warnings).toContainEqual(warning)
	for (const unwarned of testCase.unwarnedSources ?? []) {
		expect(warnings).not.toContainEqual(expect.objectContaining({ source: unwarned }))
	}
	return { assertOn: 'target' }
}
