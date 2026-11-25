/// <reference types="vite/client" />

import RealIedBesideAnotherXml from './fixtures/cid-real-ied-beside-another.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { ExtractWarning } from './extract.types'
import type { CidExtractParams } from './ied.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	options?: Partial<CidExtractParams>
	expectedWarnings?: ExtractWarning[]
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

describe('extract IED as CID - the file', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'real IED beside another -> CID with its Header, the IED as the project holds it, its own connection and no other IED':
			{
				sourceXml: RealIedBesideAnotherXml,
				targetXml: emptyTarget,
				expectedQueries: [
					'/default:SCL/default:Header[@fileType="CID"][@uuid][@uuid!="10000000-0000-4000-8000-000000000001"]',
					'/default:SCL/default:Header/default:SourceFiles/default:SclFileReference[@fileType="SCD"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
					'/default:SCL[count(default:IED)=1]',
					`${selected}[@uuid="20000000-0000-4000-8000-000000000001"][@manufacturer="SELECTED_VENDOR"][@owner="ProjectSource"][@originalSclVersion="2007"][@originalSclRevision="B"][@originalSclRelease="4"]`,
					`${selected}/default:Private[@type="vendor.device"]/*[local-name()="Settings"][text()="device payload"]`,
					`${selected}//default:LDevice[@inst="LD1"][@uuid="40000000-0000-4000-8000-000000000001"]/default:LN0[@uuid="50000000-0000-4000-8000-000000000001"]/default:DOI[@name="Status"]/default:DAI[@name="stVal"]/default:Val[text()="true"]`,
					`${selected}//default:LN0/default:GSEControl[@name="GooseOut"][@uuid="60000000-0000-4000-8000-000000000001"][@datSet="OutSet"]`,
					`${selected}//default:LN0/default:ReportControl[@name="Rpt"][@uuid="60000000-0000-4000-8000-000000000002"]`,
					`${selected}//default:LN0/default:DataSet[@name="OutSet"]/default:FCDA[@lnClass="PTOC"][@doName="Op"]`,
					'/default:SCL/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][@type="8-MMS"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"]/default:Address/default:P[@type="IP"][text()="10.0.0.1"]',
					'//default:ConnectedAP[@iedName="Selected"]/default:GSE[@cbName="GooseOut"]/default:Address/default:P[@type="APPID"][text()="0001"]',
					'//default:ConnectedAP[@iedName="Selected"]/default:PhysConn/default:P[@type="Port"][text()="1"]',
				],
				unexpectedQueries: [
					'//default:IED[@name="Other"]',
					'//default:ConnectedAP[@iedName="Other"]',
					'//default:SubNetwork[@name="OtherBus"]',
					'//default:Substation',
				],
			},
		'real IED with an unused type and source file lists -> exactly the types its logical nodes use and its lists as the source holds them':
			{
				sourceXml: RealIedBesideAnotherXml,
				targetXml: emptyTarget,
				expectedQueries: [
					'/default:SCL/default:DataTypeTemplates[count(default:LNodeType)=2][count(default:DOType)=1]',
					'//default:DataTypeTemplates/default:LNodeType[@id="LLN0_Type"]',
					'//default:DataTypeTemplates/default:LNodeType[@id="PTOC_Type"]',
					'//default:DataTypeTemplates/default:DOType[@id="Status_Type"]',
					`${selected}/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="ICD"][@fileUuid="10000000-0000-4000-8000-000000000003"]`,
					`${selected}/default:IEDSourceFiles/default:SclFileReference[2][@fileType="IID"][@fileUuid="10000000-0000-4000-8000-000000000004"]`,
					`${selected}[count(default:MinRequestedSCDFiles)=1]/default:MinRequestedSCDFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="SCD"][@fileUuid="10000000-0000-4000-8000-000000000001"][@version="1"][@revision="A"]`,
					`${selected}/default:MinRequestedSCDFiles/default:SclFileReference[2][@fileUuid="10000000-0000-4000-8000-000000000005"][@version="2"][@revision="B"]`,
				],
				unexpectedQueries: [
					'//default:LNodeType[@id="Unused_Type"]',
					'//default:LNodeType[@id="GGIO_Type"]',
					'//default:DOType[@id="Ind_Type"]',
				],
			},
		'real IED exported as CID -> the source still holds every IED, connection and type': {
			sourceXml: RealIedBesideAnotherXml,
			targetXml: emptyTarget,
			assertOn: 'source',
			expectedQueries: [
				'/default:SCL[count(default:IED)=2]',
				'//default:ConnectedAP[@iedName="Other"][@apName="AP1"]',
				'//default:SubNetwork[@name="OtherBus"]/default:ConnectedAP[@iedName="Other"]',
				'//default:LNodeType[@id="Unused_Type"]',
			],
		},
	}

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
		const result = await exported
		for (const warning of testCase.expectedWarnings ?? [])
			expect(result.warnings).toContainEqual(warning)
		return { assertOn: testCase.assertOn ?? 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
