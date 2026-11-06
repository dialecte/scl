import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ExtractWarning } from './extract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expectedWarnings: ExtractWarning[]
	rollbackFirst?: boolean
}

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

const sourceXml = /* xml */ `
	<SCL ${ns} xmlns:vendor="urn:ied-extract:test:vendor" ${id}="source-root">
		<Header id="ProjectSource" fileType="SSD" uuid="10000000-0000-4000-8000-000000000001" version="1" revision="2" ${id}="source-header"/>
		<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" templateUuid="20000000-0000-4000-8000-000000000002" desc="Selected specification" ${id}="selected-ied">
			<Private type="vendor.test" ${id}="vendor-private">
				<vendor:Settings mode="preserved">vendor payload</vendor:Settings>
			</Private>
			<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001" ${id}="selected-ap">
				<Server ${id}="selected-server">
					<Authentication none="true"/>
					<LDevice inst="LD1" uuid="40000000-0000-4000-8000-000000000001" ${id}="selected-device">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" uuid="50000000-0000-4000-8000-000000000001" ${id}="selected-ln0">
							<DataSet name="Events" ${id}="events-dataset">
								<FCDA ldInst="LD1" lnClass="PTOC" lnInst="1" doName="Status" daName="stVal" fc="ST" ${id}="ordinary-fcda"/>
							</DataSet>
							<ReportControl name="ReportEvents" datSet="Events" confRev="1" ${id}="report-control">
								<OptFields/>
								<RptEnabled max="2">
									<!-- clients -->
								</RptEnabled>
							</ReportControl>
							<GSEControl name="GooseEvents" appID="Events" datSet="Events" confRev="1" ${id}="goose-control">
								<!-- receivers -->
							</GSEControl>
						</LN0>
						<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000002" templateUuid="50000000-0000-4000-8000-000000000003" ${id}="ordinary-ln">
							<DOI name="Status" ${id}="status-instance">
								<DAI name="stVal" ${id}="status-value">
									<Val>true</Val>
								</DAI>
							</DOI>
						</LN>
						<!-- supervision -->
					</LDevice>
					<!-- associations -->
				</Server>
			</AccessPoint>
			<!-- key distribution -->
			<Labels>
				<Label lang="en" id="display">Selected device label</Label>
			</Labels>
		</IED>
		<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000003" ${id}="foreign-ied">
			<AccessPoint name="AP2" uuid="30000000-0000-4000-8000-000000000002" ${id}="foreign-ap">
				<Server>
					<Authentication/>
					<LDevice inst="LD2" ${id}="foreign-device">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" ${id}="foreign-ln0"/>
						<LN lnClass="PTOC" inst="2" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000004" ${id}="foreign-ln"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="source-types">
			<LNodeType id="LLN0_Type" lnClass="LLN0">
				<DO name="Status" type="Status_Type"/>
			</LNodeType>
			<LNodeType id="PTOC_Type" lnClass="PTOC">
				<DO name="Status" type="Status_Type"/>
				<DO name="Config" type="Config_Type"/>
			</LNodeType>
			<!-- supervision types -->
			<LNodeType id="Unused_LN" lnClass="GGIO">
				<DO name="Unused" type="Unused_DO"/>
			</LNodeType>
			<DOType id="Status_Type" cdc="SPS">
				<DA name="stVal" bType="BOOLEAN" fc="ST"/>
			</DOType>
			<DOType id="Config_Type" cdc="SPS">
				<SDO name="Detail" type="Detail_Type"/>
				<DA name="settings" bType="Struct" type="Settings_Type" fc="CF"/>
			</DOType>
			<DOType id="Detail_Type" cdc="SPS">
				<DA name="stVal" bType="BOOLEAN" fc="ST"/>
			</DOType>
			<DOType id="Unused_DO" cdc="SPS">
				<DA name="settings" bType="Struct" type="Unused_DA" fc="CF"/>
			</DOType>
			<!-- supervision data types -->
			<DAType id="Settings_Type">
				<BDA name="mode" bType="Enum" type="Mode_Type"/>
				<BDA name="nested" bType="Struct" type="Nested_Type"/>
			</DAType>
			<DAType id="Nested_Type">
				<BDA name="enabled" bType="BOOLEAN"/>
			</DAType>
			<DAType id="Unused_DA">
				<BDA name="mode" bType="Enum" type="Unused_Enum"/>
			</DAType>
			<EnumType id="Mode_Type">
				<EnumVal ord="0">off</EnumVal>
				<EnumVal ord="1">on</EnumVal>
			</EnumType>
			<EnumType id="Unused_Enum">
				<EnumVal ord="0">unused</EnumVal>
			</EnumType>
		</DataTypeTemplates>
	</SCL>
`

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

const selfReceiver = /* xml */ `<IEDName apRef="AP1" ldInst="LD1" lnClass="PTOC" lnInst="1" ${id}="self-receiver">Selected</IEDName>`
const selfClient = /* xml */ `<ClientLN iedName="Selected" apRef="AP1" ldInst="LD1" lnClass="PTOC" lnInst="1" ${id}="self-client"/>`
const selfAssociation = /* xml */ `<Association kind="pre-established" associationID="Self" iedName="Selected" apRef="AP1" ldInst="LD1" lnClass="PTOC" lnInst="1" ${id}="self-association"/>`
const selfKdc = /* xml */ `<KDC iedName="Selected" apName="AP1" ${id}="self-kdc"/>`

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
				sourceXml: sourceXml.replace(
					/(<IED name="Selected"[\s\S]*?<\/IED>)(\s*)(<IED name="Foreign"[\s\S]*?<\/IED>)/,
					'$3$2$1',
				),
				targetXml: emptyTarget,
				expectedWarnings: [],
				expectedQueries: ordinaryQueries,
				unexpectedQueries: absentQueries,
			},
		'Surviving logical nodes with nested/shared types and an unrelated type family -> exact reachable type closure':
			{
				sourceXml,
				targetXml: emptyTarget,
				expectedWarnings: [],
				expectedQueries: [...ordinaryQueries, ...closureQueries],
				unexpectedQueries: absentQueries,
			},
		'Unreferenced LGOS and LSVS beside ordinary logical nodes -> supervision omitted and individually warned':
			{
				sourceXml: sourceXml
					.replace(
						'<!-- supervision -->',
						/* xml */ `
							<LN lnClass="LGOS" inst="1" lnType="LGOS_Type" ${id}="unreferenced-lgos">
								<DOI name="Exclusive">
									<DAI name="stVal">
										<Val>false</Val>
									</DAI>
								</DOI>
							</LN>
							<LN lnClass="LSVS" inst="1" lnType="LSVS_Type" ${id}="unreferenced-lsvs">
								<DOI name="Exclusive">
									<DAI name="stVal">
										<Val>false</Val>
									</DAI>
								</DOI>
							</LN>
						`,
					)
					.replace(
						'<!-- supervision types -->',
						/* xml */ `
							<LNodeType id="LGOS_Type" lnClass="LGOS">
								<DO name="Shared" type="Status_Type"/>
								<DO name="Exclusive" type="LGOS_Only"/>
							</LNodeType>
							<LNodeType id="LSVS_Type" lnClass="LSVS">
								<DO name="Shared" type="Status_Type"/>
								<DO name="Exclusive" type="LSVS_Only"/>
							</LNodeType>
						`,
					)
					.replace(
						'<!-- supervision data types -->',
						/* xml */ `
							<DOType id="LGOS_Only" cdc="SPS">
								<DA name="stVal" bType="BOOLEAN" fc="ST"/>
							</DOType>
							<DOType id="LSVS_Only" cdc="SPS">
								<DA name="stVal" bType="BOOLEAN" fc="ST"/>
							</DOType>
						`,
					),
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
			sourceXml: sourceXml
				.replace(
					'<!-- receivers -->',
					`${selfReceiver}<IEDName apRef="AP2" ldInst="LD2" lnClass="PTOC" lnInst="2" ${id}="foreign-receiver">Foreign</IEDName>`,
				)
				.replace(
					'<!-- clients -->',
					`${selfClient}<ClientLN iedName="Foreign" apRef="AP2" ldInst="LD2" lnClass="PTOC" lnInst="2" ${id}="foreign-client"/>`,
				),
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
			sourceXml: sourceXml
				.replace(
					'<!-- associations -->',
					`${selfAssociation}<Association kind="pre-established" associationID="Foreign" iedName="Foreign" apRef="AP2" ldInst="LD2" lnClass="PTOC" lnInst="2" ${id}="foreign-association"/>`,
				)
				.replace(
					'<!-- key distribution -->',
					`${selfKdc}<KDC iedName="Foreign" apName="AP2" ${id}="foreign-kdc"/>`,
				),
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
		'Ordinary self references -> references retained, including after a rolled-back extraction attempt':
			{
				sourceXml: sourceXml
					.replace('<!-- receivers -->', selfReceiver)
					.replace('<!-- clients -->', selfClient)
					.replace('<!-- associations -->', selfAssociation)
					.replace('<!-- key distribution -->', selfKdc),
				targetXml: emptyTarget,
				expectedWarnings: [],
				rollbackFirst: true,
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
		const sourceBefore = await source.query.getSnapshot({ as: 'xml' })
		const sourceMetadataBefore = await source.query.getDocumentInfo()
		const targetBefore = await target.query.getSnapshot({ as: 'xml' })
		const targetMetadataBefore = await target.query.getDocumentInfo()
		const params = {
			sourceQuery: source.query,
			iedRef: { tagName: 'IED', id: 'selected-ied' },
			fileType: 'ISD',
			kind: 'instance',
			inputs: 'none',
			issuer: 'TEST_ISSUER',
			tool: 'TEST',
			who: 'test',
		} as const

		try {
			if (testCase.rollbackFirst) {
				const testOwnedError = new Error('test-owned rollback after extraction')
				const rolledBack = target.transaction(async function extractThenRollback(tx) {
					await tx.lifecycle.extract.ied(params)
					throw testOwnedError
				})
				await expect(rolledBack).rejects.toBeInstanceOf(Error)
				const rejection = await rolledBack.catch((error: unknown) => error)
				const reported = toDialecteError(rejection)
				expect(reported?.key).toBe('UNKNOWN')
				expect(reported?.cause).toBe(testOwnedError)
				const targetAfterRollback = await target.query.getSnapshot({ as: 'xml' })
				const targetMetadataAfterRollback = await target.query.getDocumentInfo()
				expect(targetAfterRollback).toBe(targetBefore)
				expect(targetMetadataAfterRollback).toEqual(targetMetadataBefore)
				const sourceAfterRollback = await source.query.getSnapshot({ as: 'xml' })
				const sourceMetadataAfterRollback = await source.query.getDocumentInfo()
				expect(sourceAfterRollback).toBe(sourceBefore)
				expect(sourceMetadataAfterRollback).toEqual(sourceMetadataBefore)
			}

			const extraction = target.transaction(async function extract(tx) {
				return tx.lifecycle.extract.ied(params)
			})
			await expect(extraction).resolves.toEqual({
				warnings: expect.arrayContaining(testCase.expectedWarnings),
			})
			const result = await extraction
			expect(result.warnings).toHaveLength(testCase.expectedWarnings.length)
		} finally {
			const sourceAfter = await source.query.getSnapshot({ as: 'xml' })
			const sourceMetadataAfter = await source.query.getDocumentInfo()
			expect(sourceAfter).toBe(sourceBefore)
			expect(sourceMetadataAfter).toEqual(sourceMetadataBefore)
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
