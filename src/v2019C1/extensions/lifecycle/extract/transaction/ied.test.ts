/// <reference types="vite/client" />

import SelectedIedAfterAForeignIedXml from './fixtures/selected-ied-after-a-foreign-ied.xml?raw'
import SelectedIedWithForeignAssociationAndKdcXml from './fixtures/selected-ied-with-foreign-association-and-kdc.xml?raw'
import SelectedIedWithForeignIednameAndClientlnXml from './fixtures/selected-ied-with-foreign-iedname-and-clientln.xml?raw'
import SelectedIedWithSelfReferencesXml from './fixtures/selected-ied-with-self-references.xml?raw'
import SelectedIedWithSharedAndUnusedTypesXml from './fixtures/selected-ied-with-shared-and-unused-types.xml?raw'
import SelectedIedWithUnreferencedLgosAndLsvsXml from './fixtures/selected-ied-with-unreferenced-lgos-and-lsvs.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ExtractWarning } from './extract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expectedWarnings: ExtractWarning[]
}

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

const ordinaryQueries = [
	'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"][@templateUuid="20000000-0000-4000-8000-000000000002"][@desc="Selected specification"]',
	'//default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"][@uuid="30000000-0000-4000-8000-000000000001"]/default:Server/default:Authentication',
	'//default:LDevice[@inst="LD1"][@uuid="40000000-0000-4000-8000-000000000001"][count(default:LN0)=1][count(default:LN)=1]',
	'//default:LN0[@lnClass="LLN0"][@inst=""][@lnType="LLN0_Type"][@uuid="50000000-0000-4000-8000-000000000001"]/default:DataSet[@name="Events"][count(default:FCDA)=1]/default:FCDA[@ldInst="LD1"][@lnClass="PTOC"][@lnInst="1"][@doName="Status"][@daName="stVal"][@fc="ST"]',
	'//default:LN[@lnClass="PTOC"][@inst="1"][@lnType="PTOC_Type"][@uuid="50000000-0000-4000-8000-000000000002"][@templateUuid="50000000-0000-4000-8000-000000000003"]/default:DOI[@name="Status"]/default:DAI[@name="stVal"]/default:Val[text()="true"]',
	'//default:ReportControl[@name="ReportEvents"][@datSet="Events"][@confRev="1"]/default:OptFields',
	'//default:GSEControl[@name="GooseEvents"][@appID="Events"][@datSet="Events"][@confRev="1"]',
	'//default:IED[@name="Selected"]/default:Labels/default:Label[@lang="en"][@id="display"][text()="Selected device label"]',
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.test"]/*[local-name()="Settings"][namespace-uri()="urn:ied-extract:test:vendor"][@mode="preserved"][text()="vendor payload"]',
]

const closureQueries = [
	'//default:DataTypeTemplates[count(default:LNodeType)=2][count(default:DOType)=3][count(default:DAType)=2][count(default:EnumType)=1][count(*)=8]',
	'//default:DataTypeTemplates[count(default:LNodeType[@id="LLN0_Type"])=1][count(default:LNodeType[@id="PTOC_Type"])=1]',
	'//default:DataTypeTemplates[count(default:DOType[@id="Status_Type"])=1][count(default:DOType[@id="Config_Type"])=1][count(default:DOType[@id="Detail_Type"])=1]',
	'//default:DataTypeTemplates[count(default:DAType[@id="Settings_Type"])=1][count(default:DAType[@id="Nested_Type"])=1][count(default:EnumType[@id="Mode_Type"])=1]',
	'//default:LNodeType[@id="LLN0_Type"][@lnClass="LLN0"]/default:DO[@name="Status"][@type="Status_Type"]',
	'//default:LNodeType[@id="PTOC_Type"][@lnClass="PTOC"][count(default:DO)=2]/default:DO[@name="Config"][@type="Config_Type"]',
	'//default:DOType[@id="Status_Type"][@cdc="SPS"]/default:DA[@name="stVal"][@bType="BOOLEAN"][@fc="ST"]',
	'//default:DOType[@id="Config_Type"]/default:SDO[@name="Detail"][@type="Detail_Type"]',
	'//default:DOType[@id="Config_Type"]/default:DA[@name="settings"][@bType="Struct"][@type="Settings_Type"][@fc="CF"]',
	'//default:DOType[@id="Detail_Type"]/default:DA[@name="stVal"][@bType="BOOLEAN"]',
	'//default:DAType[@id="Settings_Type"][count(default:BDA)=2]/default:BDA[@name="mode"][@bType="Enum"][@type="Mode_Type"]',
	'//default:DAType[@id="Settings_Type"]/default:BDA[@name="nested"][@bType="Struct"][@type="Nested_Type"]',
	'//default:DAType[@id="Nested_Type"]/default:BDA[@name="enabled"][@bType="BOOLEAN"]',
	'//default:EnumType[@id="Mode_Type"][count(default:EnumVal)=2]/default:EnumVal[@ord="0"][text()="off"]',
	'//default:EnumType[@id="Mode_Type"]/default:EnumVal[@ord="1"][text()="on"]',
]

const absentQueries = [
	'//default:IED[@name="Foreign"]',
	'//default:LNodeType[@id="Unused_LN"]',
	'//default:DOType[@id="Unused_DO"]',
	'//default:DAType[@id="Unused_DA"]',
	'//default:EnumType[@id="Unused_Enum"]',
]

const selfReferenceQueries = [
	'//default:GSEControl[@name="GooseEvents"][count(default:IEDName)=1]/default:IEDName[@apRef="AP1"][@ldInst="LD1"][@lnClass="PTOC"][@lnInst="1"][@lnUuid=//default:LN[@lnClass="PTOC"]/@uuid][text()="Selected"]',
	'//default:ReportControl[@name="ReportEvents"]/default:RptEnabled[count(default:ClientLN)=1]/default:ClientLN[@iedName="Selected"][@apRef="AP1"][@ldInst="LD1"][@lnClass="PTOC"][@lnInst="1"][@lnUuid=//default:LN[@lnClass="PTOC"]/@uuid]',
	'//default:AccessPoint[@name="AP1"]/default:Server[count(default:Association)=1]/default:Association[@associationID="Self"][@kind="pre-established"][@iedName="Selected"][@apRef="AP1"][@ldInst="LD1"][@lnClass="PTOC"][@lnInst="1"][@lnUuid=//default:LN[@lnClass="PTOC"]/@uuid]',
	'//default:IED[@name="Selected"][count(default:KDC)=1]/default:KDC[@iedName="Selected"][@apName="AP1"][@apUuid=//default:AccessPoint[@name="AP1"]/@uuid]',
]

describe('extract.ied - selected instance content', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'Ordinary selected IED with LN0, values, labels and vendor content -> faithful instance copy only':
			{
				sourceXml: SelectedIedAfterAForeignIedXml,
				targetXml: emptyTarget,
				expectedWarnings: [],
				expectedQueries: ordinaryQueries,
				unexpectedQueries: absentQueries,
			},
		'Surviving logical nodes with nested/shared types and an unrelated type family -> exact reachable type closure':
			{
				sourceXml: SelectedIedWithSharedAndUnusedTypesXml,
				targetXml: emptyTarget,
				expectedWarnings: [],
				expectedQueries: [...ordinaryQueries, ...closureQueries],
				unexpectedQueries: absentQueries,
			},
		'Unreferenced LGOS and LSVS beside ordinary logical nodes -> supervision omitted and individually warned':
			{
				sourceXml: SelectedIedWithUnreferencedLgosAndLsvsXml,
				targetXml: emptyTarget,
				expectedWarnings: [
					{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'unreferenced-lgos' } },
					{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'unreferenced-lsvs' } },
				],
				expectedQueries: [...ordinaryQueries, ...closureQueries],
				unexpectedQueries: [
					...absentQueries,
					'//default:LN[@lnClass="LGOS" or @lnClass="LSVS"]',
					'//default:LNodeType[@id="LGOS_Type" or @id="LSVS_Type"]',
					'//default:DOType[@id="LGOS_Only" or @id="LSVS_Only"]',
				],
			},
		'Foreign IEDName and ClientLN entries -> entries omitted and individually warned': {
			sourceXml: SelectedIedWithForeignIednameAndClientlnXml,
			targetXml: emptyTarget,
			expectedWarnings: [
				{
					code: 'ied-reference-left-out',
					source: { tagName: 'IEDName', id: 'foreign-receiver' },
					iedName: 'Foreign',
				},
				{
					code: 'ied-reference-left-out',
					source: { tagName: 'ClientLN', id: 'foreign-client' },
					iedName: 'Foreign',
				},
			],
			expectedQueries: [...ordinaryQueries, ...selfReferenceQueries.slice(0, 2)],
			unexpectedQueries: [
				...absentQueries,
				'//default:IEDName[text()="Foreign"]',
				'//default:ClientLN[@iedName="Foreign"]',
			],
		},
		'Foreign Association and KDC entries -> entries omitted and individually warned': {
			sourceXml: SelectedIedWithForeignAssociationAndKdcXml,
			targetXml: emptyTarget,
			expectedWarnings: [
				{
					code: 'ied-reference-left-out',
					source: { tagName: 'Association', id: 'foreign-association' },
					iedName: 'Foreign',
				},
				{
					code: 'ied-reference-left-out',
					source: { tagName: 'KDC', id: 'foreign-kdc' },
					iedName: 'Foreign',
				},
			],
			expectedQueries: [...ordinaryQueries, ...selfReferenceQueries.slice(2)],
			unexpectedQueries: [
				...absentQueries,
				'//default:Association[@iedName="Foreign"]',
				'//default:KDC[@iedName="Foreign"]',
			],
		},
		'Ordinary self references -> references retained': {
			sourceXml: SelectedIedWithSelfReferencesXml,
			targetXml: emptyTarget,
			expectedWarnings: [],
			expectedQueries: [...ordinaryQueries, ...closureQueries, ...selfReferenceQueries],
			unexpectedQueries: absentQueries,
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const { warnings } = await target.transaction(async function extract(tx) {
			return tx.lifecycle.extract.ied({
				sourceQuery: source.query,
				iedRef: { tagName: 'IED', id: 'selected-ied' },
				fileType: 'ISD',
				kind: 'instance',
				inputs: 'none',
				issuer: 'TEST_ISSUER',
				tool: 'TEST',
				who: 'test',
			})
		})
		expect(warnings).toHaveLength(testCase.expectedWarnings.length)
		expect(warnings).toEqual(expect.arrayContaining(testCase.expectedWarnings))
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
