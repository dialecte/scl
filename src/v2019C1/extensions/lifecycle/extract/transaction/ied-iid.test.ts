/// <reference types="vite/client" />

import RealIedBesideAnotherXml from './fixtures/cid-real-ied-beside-another.xml?raw'
import RealIedWithClientsAndSupervisionXml from './fixtures/cid-real-ied-with-clients-and-supervision.xml?raw'
import RealIedWithInputsBoundElsewhereXml from './fixtures/cid-real-ied-with-inputs-bound-elsewhere.xml?raw'
import RealIedWithSubstationPartXml from './fixtures/cid-real-ied-with-substation-part.xml?raw'
import RealIedBesideAnUnassignedLNodeXml from './fixtures/iid-real-ied-beside-an-unassigned-lnode.xml?raw'
import RealIedOwnedElsewhereXml from './fixtures/iid-real-ied-owned-elsewhere.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { IidExtractParams } from './ied.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	options?: Partial<IidExtractParams>
	/** Warnings the result holds, each equal to one returned warning. */
	expectedWarnings?: Record<string, unknown>[]
	/** Warning codes no returned warning carries. */
	unwarnedCodes?: string[]
	/** Records no returned warning names as its source. */
	unwarnedSources?: { tagName: string; id: string }[]
}

const IID = {
	fileType: 'IID',
	iedRef: { tagName: 'IED', id: 'selected-ied' },
	tool: 'TEST',
	who: 'test',
} as const satisfies Omit<IidExtractParams, 'sourceQuery'>

const emptyTarget = /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="empty-target"/>`

const selected = '/default:SCL/default:IED[@name="Selected"]'
const ptoc = `${selected}//default:LN[@lnClass="PTOC"]`

function inputBoundOutside(id: string, iedName: string): Record<string, unknown> {
	return { code: 'input-bound-outside', source: { tagName: 'ExtRef', id }, iedName }
}

describe('extract IED as IID - the IED as the project holds it, alone in the file', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		// Selected's LN0 and PTOC hold inputs bound to Other by their whole binding, a poll of Other, and an input bound to Ghost, no IED of the project
		'inputs bound to Other and to Ghost -> each written with its whole binding and listed': {
			sourceXml: RealIedWithInputsBoundElsewhereXml,
			targetXml: emptyTarget,
			expectedQueries: [
				`${selected}//default:LN0/default:Inputs/default:ExtRef[@desc="system input from other"][@iedName="Other"][@ldInst="OLD"][@doName="Ind"][@daName="stVal"][@serviceType="GOOSE"][@srcLDInst="OLD"][@srcLNClass="LLN0"][@srcCBName="OtherGoose"]`,
				`${ptoc}/default:Inputs/default:ExtRef[@intAddr="BlockIn"][@iedName="Other"][@ldInst="OLD"][@lnClass="GGIO"][@lnInst="1"][@doName="Ind"][@daName="stVal"][@serviceType="GOOSE"][@srcCBName="OtherGoose"][@uuid="70000000-0000-4000-8000-000000000001"]`,
				`${ptoc}/default:Inputs/default:ExtRef[@desc="system poll of other"][@iedName="Other"][@serviceType="Poll"]`,
				`${ptoc}/default:Inputs/default:ExtRef[@intAddr="GhostIn"][@iedName="Ghost"][@ldInst="GLD"]`,
			],
			expectedWarnings: [
				inputBoundOutside('extref-SystemInput', 'Other'),
				inputBoundOutside('extref-BlockIn', 'Other'),
				inputBoundOutside('extref-SystemPoll', 'Other'),
				inputBoundOutside('extref-GhostIn', 'Ghost'),
			],
			unwarnedCodes: ['input-removed', 'input-unbound', 'input-incomplete'],
		},
		// Selected's PTOC holds two outputs controlling Other, one with an internal address
		'outputs controlling Other -> written with their binding and listed': {
			sourceXml: RealIedWithInputsBoundElsewhereXml,
			targetXml: emptyTarget,
			expectedQueries: [
				`${ptoc}/default:Outputs/default:ExtCtrl[@intAddr="TripOut"][@iedName="Other"][@ldInst="OLD"][@doName="Ind"]`,
				`${ptoc}/default:Outputs/default:ExtCtrl[@desc="output to other without address"][@iedName="Other"]`,
			],
			expectedWarnings: [
				{
					code: 'input-bound-outside',
					source: { tagName: 'ExtCtrl', id: 'extctrl-TripOut' },
					iedName: 'Other',
				},
				{
					code: 'input-bound-outside',
					source: { tagName: 'ExtCtrl', id: 'extctrl-OutputWithoutAddress' },
					iedName: 'Other',
				},
			],
		},
		// Selected's PTOC holds inputs relative to itself, bound to itself, and one not bound
		'inputs relative to the IED, bound to the IED itself, or not bound -> written as they are, not listed':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="RelativeIn"][@iedName="@"]`,
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="SelfIn"][@iedName="Selected"]`,
					`${ptoc}/default:Inputs/default:ExtRef[@intAddr="TemplateIn"][not(@iedName)]`,
				],
				unwarnedSources: [
					{ tagName: 'ExtRef', id: 'extref-RelativeIn' },
					{ tagName: 'ExtRef', id: 'extref-SelfIn' },
					{ tagName: 'ExtRef', id: 'extref-TemplateIn' },
				],
			},
		// Selected and Other share StationBus; Selected came from a vendor ICD; the project Header is ProjectSource
		'IED beside Other in the project -> the file holds Selected alone, its own connection with its address, the IID Header, the project recorded':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [
					'/default:SCL[count(default:IED)=1]',
					'/default:SCL/default:Header[@fileType="IID"][@uuid!="10000000-0000-4000-8000-000000000001"]',
					'//default:Header//default:SclFileReference[@fileUuid="10000000-0000-4000-8000-000000000001"]',
					'//default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"]/default:Address/default:P[@type="IP"][text()="10.0.0.1"]',
					`${selected}[@uuid="20000000-0000-4000-8000-000000000001"]`,
					`${selected}/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="ICD"][@fileUuid="10000000-0000-4000-8000-000000000003"]`,
					'/default:SCL/default:DataTypeTemplates/default:LNodeType[@id="PTOC_Type"]',
				],
				unexpectedQueries: [
					'//default:IED[@name="Other"]',
					'//default:ConnectedAP[@iedName="Other"]',
					'/default:SCL/default:Substation',
				],
			},
		// Selected holds values, a vendor Private, two IEDSourceFiles and two MinRequestedSCDFiles entries, its GooseOut with a GSE and a PhysConn on StationBus
		'IED with values, vendor content, both lists of files and its GOOSE -> written as the project holds them, the lists exactly the source entries':
			{
				sourceXml: RealIedBesideAnotherXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${selected}[@owner="ProjectSource"][@manufacturer="SELECTED_VENDOR"][@originalSclRevision="B"]/default:Private[@type="vendor.device"]`,
					`${selected}//default:LN0/default:DOI[@name="Status"]/default:DAI[@name="stVal"]/default:Val[text()="true"]`,
					`${selected}/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[@fileType="IID"][@fileUuid="10000000-0000-4000-8000-000000000004"]`,
					`${selected}/default:MinRequestedSCDFiles[count(default:SclFileReference)=2]/default:SclFileReference[@fileName="ProjectSource"][@fileUuid="10000000-0000-4000-8000-000000000001"]`,
					`${selected}/default:MinRequestedSCDFiles/default:SclFileReference[@fileName="OtherProject"][@fileUuid="10000000-0000-4000-8000-000000000005"]`,
					'//default:ConnectedAP[@iedName="Selected"]/default:GSE[@cbName="GooseOut"]/default:Address/default:P[@type="APPID"][text()="0001"]',
					'//default:ConnectedAP[@iedName="Selected"]/default:PhysConn[@type="Connection"]',
				],
				unexpectedQueries: [
					'//default:IED[@name="Other"]',
					'//default:ConnectedAP[@iedName="Other"]',
				],
			},
		// Selected's LN0 holds OutSet; the templates hold the types of Selected, of Other (GGIO_Type, Ind_Type) and Unused_Type
		'IED beside Other with types of its own and of Other -> its data set kept, only the types its logical nodes use':
			{
				sourceXml: RealIedBesideAnotherXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${selected}//default:LN0/default:DataSet[@name="OutSet"]/default:FCDA[@lnClass="PTOC"][@doName="Op"]`,
					'/default:SCL/default:DataTypeTemplates/default:LNodeType[@id="LLN0_Type"]',
					'/default:SCL/default:DataTypeTemplates/default:LNodeType[@id="PTOC_Type"]',
					'/default:SCL/default:DataTypeTemplates/default:DOType[@id="Status_Type"]',
				],
				unexpectedQueries: [
					'//default:LNodeType[@id="GGIO_Type"]',
					'//default:LNodeType[@id="Unused_Type"]',
					'//default:DOType[@id="Ind_Type"]',
				],
			},
		// Selected holds no MinRequestedSCDFiles
		'IED with no list of minimum project files -> none written': {
			sourceXml: RealIedWithInputsBoundElsewhereXml,
			targetXml: emptyTarget,
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},
		// Selected holds no owner; the project Header id is ProjectSource
		'IED with no owner -> owner written as the Header id of the project it comes from': {
			sourceXml: RealIedWithInputsBoundElsewhereXml,
			targetXml: emptyTarget,
			expectedQueries: [`${selected}[@owner="ProjectSource"]`],
		},
		// Selected is owned by OtherProject and has no connection
		'IED owned by another project, with no connection -> written with its owner, no Communication':
			{
				sourceXml: RealIedOwnedElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [`${selected}[@owner="OtherProject"]`],
				unexpectedQueries: ['/default:SCL/default:Communication'],
			},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extract IED as IID - receivers, report clients, associations and supervision naming another IED', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		// Selected's GooseOut and Rpt name Other and itself; its access point holds an Association and a KDC naming Other
		'receivers, report clients, association and key entry naming Other -> kept and listed, those naming the IED kept, not listed':
			{
				sourceXml: RealIedWithClientsAndSupervisionXml,
				targetXml: emptyTarget,
				expectedQueries: [
					`${selected}//default:GSEControl[@name="GooseOut"][count(default:IEDName)=2]/default:IEDName[text()="Other"][@lnUuid="50000000-0000-4000-8000-000000000004"]`,
					`${selected}//default:ReportControl[@name="Rpt"]/default:RptEnabled[count(default:ClientLN)=2]/default:ClientLN[@iedName="Other"]`,
					`${selected}//default:Association[@iedName="Other"]`,
					`${selected}//default:KDC[@iedName="Other"]`,
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
				unwarnedSources: [
					{ tagName: 'IEDName', id: 'iedname-self' },
					{ tagName: 'ClientLN', id: 'clientln-self' },
				],
			},
		// Selected's LGOS1 supervises a GOOSE of Other, its LSVS1 a stream of Ghost
		'supervisions of a GOOSE of Other and of a stream of Ghost -> kept and listed': {
			sourceXml: RealIedWithClientsAndSupervisionXml,
			targetXml: emptyTarget,
			expectedQueries: [
				`${selected}//default:LN[@lnClass="LGOS"][@inst="1"]`,
				`${selected}//default:LN[@lnClass="LSVS"][@inst="1"]`,
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
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extract IED as IID - the LNodes of the substation part the IED implements', () => {
	const boundLNodes = {
		code: 'bound-lnodes-not-carried',
		ied: { tagName: 'IED', id: 'selected-ied' },
		lnodes: [{ tagName: 'LNode', id: 'lnode-selected' }],
	}
	const testCases: SclTest.TestCases<TestCase> = {
		// Bay B1 holds one LNode Selected implements and one of Other
		'substation part left at its default -> no substation in the file, the LNode the IED implements listed':
			{
				sourceXml: RealIedWithSubstationPartXml,
				targetXml: emptyTarget,
				unexpectedQueries: ['/default:SCL/default:Substation', '//default:LNode'],
				expectedWarnings: [boundLNodes],
			},
		// Bay B1 holds one LNode Selected implements and one of Other
		'substation part asked -> the frames of the LNode the IED implements written, nothing listed': {
			sourceXml: RealIedWithSubstationPartXml,
			targetXml: emptyTarget,
			options: { includeSubstation: true },
			expectedQueries: [
				'/default:SCL/default:Substation[@name="S1"]//default:Bay[@name="B1"]//default:LNode[@iedName="Selected"][@uuid="80000000-0000-4000-8000-0000000000a1"]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="Other"]'],
			unwarnedCodes: ['bound-lnodes-not-carried'],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extract IED as IID - the warnings, each once and nothing else', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		// Selected's LN0 and PTOC hold nine inputs and outputs bound to Other or Ghost, and inputs relative to itself, bound to itself or not bound
		'every reference of Selected to an IED the file does not hold -> one warning each, nothing else':
			{
				sourceXml: RealIedWithInputsBoundElsewhereXml,
				targetXml: emptyTarget,
				expectedQueries: [`${selected}`],
				expectedWarnings: [
					inputBoundOutside('extref-SystemInput', 'Other'),
					inputBoundOutside('extref-BlockIn', 'Other'),
					inputBoundOutside('extref-SystemPoll', 'Other'),
					inputBoundOutside('extref-SiblingA', 'Other'),
					inputBoundOutside('extref-SiblingB', 'Other'),
					inputBoundOutside('extref-GhostIn', 'Ghost'),
					inputBoundOutside('extref-NoDescIn', 'Other'),
					{
						code: 'input-bound-outside',
						source: { tagName: 'ExtCtrl', id: 'extctrl-TripOut' },
						iedName: 'Other',
					},
					{
						code: 'input-bound-outside',
						source: { tagName: 'ExtCtrl', id: 'extctrl-OutputWithoutAddress' },
						iedName: 'Other',
					},
				],
			},
		// Bay B1 holds one LNode assigned to no IED; Selected implements none
		'IED implementing no LNode of the substation part -> nothing written of it, nothing listed': {
			sourceXml: RealIedBesideAnUnassignedLNodeXml,
			targetXml: emptyTarget,
			expectedQueries: [`${selected}`],
			unexpectedQueries: ['/default:SCL/default:Substation', '//default:LNode'],
			expectedWarnings: [],
		},
	}

	async function actExactWarnings(params: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { source, target, testCase } = params
		if (!target) throw new Error('target required')
		const { warnings } = await target.transaction(async function exportIid(tx) {
			return tx.lifecycle.extract.ied({ ...IID, sourceQuery: source.query })
		})
		expect(warnings).toHaveLength(testCase.expectedWarnings?.length ?? 0)
		for (const warning of testCase.expectedWarnings ?? []) expect(warnings).toContainEqual(warning)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act: actExactWarnings })
})

async function act({
	source,
	target,
	testCase,
}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	const exported = target.transaction(async function exportIid(tx) {
		return tx.lifecycle.extract.ied({ ...IID, ...testCase.options, sourceQuery: source.query })
	})
	await expect(exported).resolves.toMatchObject({ fileName: 'Selected.iid' })
	const { warnings } = await exported
	expect(new Set(warnings.map((warning) => JSON.stringify(warning))).size).toBe(warnings.length)
	for (const warning of testCase.expectedWarnings ?? []) {
		expect(warnings).toContainEqual(warning)
	}
	for (const code of testCase.unwarnedCodes ?? []) {
		expect(warnings).not.toContainEqual(expect.objectContaining({ code }))
	}
	for (const unwarned of testCase.unwarnedSources ?? []) {
		expect(warnings).not.toContainEqual(expect.objectContaining({ source: unwarned }))
	}
	return { assertOn: 'target' }
}
