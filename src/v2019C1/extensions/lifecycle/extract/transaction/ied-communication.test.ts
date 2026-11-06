import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	rollbackFirst?: boolean
	namesOnly?: boolean
}

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

const sourceXml = /* xml */ `
	<SCL ${ns} xmlns:vendor="urn:ied-communication:test" ${id}="source-root">
		<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="1" revision="2" ${id}="source-header"/>
		<!-- communication -->
		<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002" ${id}="foreign-ied">
			<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000003" ${id}="foreign-ap">
				<Server>
					<Authentication/>
					<LDevice inst="ForeignLD">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
			<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001" ${id}="selected-ap1">
				<Server>
					<Authentication/>
					<LDevice inst="LD1" uuid="40000000-0000-4000-8000-000000000001">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" uuid="50000000-0000-4000-8000-000000000001">
							<!-- controls -->
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
			<AccessPoint name="AP2" uuid="30000000-0000-4000-8000-000000000002" ${id}="selected-ap2">
				<Server>
					<Authentication/>
					<LDevice inst="LD2">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates>
			<LNodeType id="LLN0_Type" lnClass="LLN0">
				<DO name="Status" type="Status_Type"/>
			</LNodeType>
			<DOType id="Status_Type" cdc="SPS">
				<DA name="stVal" bType="BOOLEAN" fc="ST"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

const selectedConnection = /* xml */ `<ConnectedAP iedName="Selected" apName="AP1" apUuid="30000000-0000-4000-8000-000000000001" ${id}="selected-connection"/>`
const foreignConnection = /* xml */ `<ConnectedAP iedName="Foreign" apName="AP1" apUuid="30000000-0000-4000-8000-000000000003" ${id}="foreign-connection"/>`

const selectedQueries = [
	'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"][count(default:AccessPoint)=2]',
	'//default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"][@uuid="30000000-0000-4000-8000-000000000001"]',
	'//default:IED[@name="Selected"]/default:AccessPoint[@name="AP2"][@uuid="30000000-0000-4000-8000-000000000002"]',
]
const foreignQueries = [
	'//default:IED[@name="Foreign"]',
	'//default:ConnectedAP[@iedName="Foreign"]',
	'//default:ConnectedAP[@apUuid="30000000-0000-4000-8000-000000000003"]',
]

describe('extract IED Communication', () => {
	const testCases: Record<string, TestCase> = {
		'Two selected access points on two networks -> both connections retained': {
			sourceXml: sourceXml.replace(
				'<!-- communication -->',
				/* xml */ `
					<Communication>
						<SubNetwork name="StationBus">${selectedConnection}</SubNetwork>
						<SubNetwork name="ProcessBus">
							<ConnectedAP iedName="Selected" apName="AP2" apUuid="30000000-0000-4000-8000-000000000002"/>
						</SubNetwork>
					</Communication>
				`,
			),
			targetXml: emptyTarget,
			rollbackFirst: true,
			expectedQueries: [
				...selectedQueries,
				'/default:SCL[count(default:Communication)=1]/default:Communication[count(default:SubNetwork)=2]',
				'//default:Communication/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"][@apUuid="30000000-0000-4000-8000-000000000001"]',
				'//default:Communication/default:SubNetwork[@name="ProcessBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP2"][@apUuid="30000000-0000-4000-8000-000000000002"]',
				'/default:SCL[count(default:Communication/default:SubNetwork/default:ConnectedAP)=2]',
			],
			unexpectedQueries: foreignQueries,
		},
		'Shared network with foreign connection -> only selected connection retained': {
			sourceXml: sourceXml.replace(
				'<!-- communication -->',
				/* xml */ `
					<Communication>
						<SubNetwork name="StationBus">
					${foreignConnection}${selectedConnection}
				</SubNetwork>
					</Communication>
				`,
			),
			targetXml: emptyTarget,
			expectedQueries: [
				...selectedQueries,
				'/default:SCL[count(default:Communication)=1]/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"][@apUuid="30000000-0000-4000-8000-000000000001"]',
			],
			unexpectedQueries: foreignQueries,
		},
		'Unrelated foreign network -> whole network excluded': {
			sourceXml: sourceXml.replace(
				'<!-- communication -->',
				/* xml */ `
					<Communication>
						<SubNetwork name="ProcessBus">${foreignConnection}</SubNetwork>
						<SubNetwork name="StationBus">${selectedConnection}</SubNetwork>
					</Communication>
				`,
			),
			targetXml: emptyTarget,
			expectedQueries: [
				...selectedQueries,
				'/default:SCL[count(default:Communication)=1]/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"][@apUuid="30000000-0000-4000-8000-000000000001"]',
			],
			unexpectedQueries: [...foreignQueries, '//default:SubNetwork[@name="ProcessBus"]'],
		},
		'Names-only connection -> selected without manufacturing UUID twin': {
			sourceXml: sourceXml.replace(
				'<!-- communication -->',
				/* xml */ `
					<Communication>
						<SubNetwork name="StationBus">
					${foreignConnection}
					<ConnectedAP iedName="Selected" apName="AP1" ${id}="selected-connection"/>
				</SubNetwork>
					</Communication>
				`,
			),
			targetXml: emptyTarget,
			namesOnly: true,
			expectedQueries: [
				...selectedQueries,
				'/default:SCL[count(default:Communication)=1]/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"][not(@apUuid) or @apUuid=/default:SCL/default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"]/@uuid]',
			],
			unexpectedQueries: [
				...foreignQueries,
				'//default:ConnectedAP[@iedName="Selected"][@apUuid][not(@apUuid=/default:SCL/default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"]/@uuid)]',
			],
		},
		'No selected connection -> Communication absent': {
			sourceXml: sourceXml.replace(
				'<!-- communication -->',
				/* xml */ `
					<Communication>
						<SubNetwork name="ForeignBus">${foreignConnection}</SubNetwork>
					</Communication>
				`,
			),
			targetXml: emptyTarget,
			expectedQueries: [...selectedQueries, '/default:SCL[count(default:Communication)=0]'],
			unexpectedQueries: [...foreignQueries, '/default:SCL/default:Communication'],
		},
		'Selected communication payload -> metadata and children retained': {
			sourceXml: sourceXml
				.replace(
					'<!-- communication -->',
					/* xml */ `
						<Communication>
							<SubNetwork name="StationBus" type="8-MMS" desc="Selected station network">
								<Text>station network text</Text>
								<Private type="vendor.network">
									<vendor:Network mode="retained">network payload</vendor:Network>
								</Private>
								<BitRate unit="b/s" multiplier="M">100</BitRate>
								<ConnectedAP iedName="Selected" apName="AP1" apUuid="30000000-0000-4000-8000-000000000001" desc="Selected connection" ${id}="selected-connection">
									<Text>selected connection text</Text>
									<Private type="vendor.connection">
										<vendor:Connection mode="retained">connection payload</vendor:Connection>
									</Private>
									<Address>
										<P type="IP">10.0.0.1</P>
									</Address>
									<GSE ldInst="LD1" cbName="GooseEvents" cbUuid="60000000-0000-4000-8000-000000000001" desc="Selected GOOSE">
										<Address>
											<P type="MAC-Address">01-0C-CD-01-00-01</P>
										</Address>
										<MinTime unit="s" multiplier="m">4</MinTime>
										<MaxTime unit="s" multiplier="m">1000</MaxTime>
									</GSE>
									<SMV ldInst="LD1" cbName="SampledEvents" cbUuid="60000000-0000-4000-8000-000000000002" desc="Selected samples">
										<Address>
											<P type="MAC-Address">01-0C-CD-04-00-01</P>
										</Address>
									</SMV>
									<PhysConn type="Connection">
										<P type="Port">1</P>
									</PhysConn>
								</ConnectedAP>
							</SubNetwork>
						</Communication>
					`,
				)
				.replace(
					'<!-- controls -->',
					/* xml */ `
						<GSEControl name="GooseEvents" appID="Events" confRev="1" uuid="60000000-0000-4000-8000-000000000001"/>
						<SampledValueControl name="SampledEvents" smvID="Samples" smpRate="80" nofASDU="1" confRev="1" uuid="60000000-0000-4000-8000-000000000002">
							<SmvOpts refreshTime="true" sampleSynchronized="true"/>
						</SampledValueControl>
					`,
				),
			targetXml: emptyTarget,
			expectedQueries: [
				...selectedQueries,
				'/default:SCL[count(default:Communication)=1]/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][@type="8-MMS"][@desc="Selected station network"][count(default:ConnectedAP)=1]',
				'//default:SubNetwork[@name="StationBus"]/default:Text[text()="station network text"]',
				'//default:SubNetwork[@name="StationBus"]/default:Private[@type="vendor.network"]/*[local-name()="Network"][namespace-uri()="urn:ied-communication:test"][@mode="retained"][text()="network payload"]',
				'//default:SubNetwork[@name="StationBus"]/default:BitRate[@unit="b/s"][@multiplier="M"][text()="100"]',
				'//default:SubNetwork[@name="StationBus"]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"][@apUuid="30000000-0000-4000-8000-000000000001"][@desc="Selected connection"][count(default:Address)=1][count(default:GSE)=1][count(default:SMV)=1][count(default:PhysConn)=1]',
				'//default:ConnectedAP[@iedName="Selected"]/default:Text[text()="selected connection text"]',
				'//default:ConnectedAP[@iedName="Selected"]/default:Private[@type="vendor.connection"]/*[local-name()="Connection"][namespace-uri()="urn:ied-communication:test"][@mode="retained"][text()="connection payload"]',
				'//default:ConnectedAP[@iedName="Selected"]/default:Address[count(default:P)=1]/default:P[@type="IP"][text()="10.0.0.1"]',
				'//default:ConnectedAP[@iedName="Selected"]/default:PhysConn[@type="Connection"][count(default:P)=1]/default:P[@type="Port"][text()="1"]',
				'//default:ConnectedAP[@iedName="Selected"]/default:GSE[@ldInst="LD1"][@cbName="GooseEvents"][@cbUuid="60000000-0000-4000-8000-000000000001"][@desc="Selected GOOSE"]/default:Address/default:P[@type="MAC-Address"][text()="01-0C-CD-01-00-01"]',
				'//default:GSE[@cbName="GooseEvents"]/default:MinTime[@unit="s"][@multiplier="m"][text()="4"]',
				'//default:GSE[@cbName="GooseEvents"]/default:MaxTime[@unit="s"][@multiplier="m"][text()="1000"]',
				'//default:ConnectedAP[@iedName="Selected"]/default:SMV[@ldInst="LD1"][@cbName="SampledEvents"][@cbUuid="60000000-0000-4000-8000-000000000002"][@desc="Selected samples"]/default:Address/default:P[@type="MAC-Address"][text()="01-0C-CD-04-00-01"]',
				'//default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"]/default:Server/default:LDevice[@inst="LD1"]/default:LN0/default:GSEControl[@name="GooseEvents"][@appID="Events"][@confRev="1"][@uuid="60000000-0000-4000-8000-000000000001"]',
				'//default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"]/default:Server/default:LDevice[@inst="LD1"]/default:LN0/default:SampledValueControl[@name="SampledEvents"][@smvID="Samples"][@smpRate="80"][@nofASDU="1"][@confRev="1"][@uuid="60000000-0000-4000-8000-000000000002"]/default:SmvOpts[@refreshTime="true"][@sampleSynchronized="true"]',
			],
			unexpectedQueries: foreignQueries,
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		if (testCase.namesOnly) {
			await source.transaction(async function clearConnectionUuid(tx) {
				await tx.update(
					{ tagName: 'ConnectedAP', id: 'selected-connection' },
					{ attributes: { apUuid: undefined } },
				)
			})
			const connectionUuid = await source.query.getAttribute(
				{ tagName: 'ConnectedAP', id: 'selected-connection' },
				{ name: 'apUuid', defaults: 'none', fullObject: true },
			)
			expect(connectionUuid).toBeUndefined()
		}
		const sourceBefore = await source.query.getSnapshot({ as: 'xml' })
		const sourceMetadata = await source.query.getDocumentInfo()
		const sourceMetadataBefore = structuredClone(sourceMetadata)
		const targetBefore = await target.query.getSnapshot({ as: 'xml' })
		const targetMetadata = await target.query.getDocumentInfo()
		const targetMetadataBefore = structuredClone(targetMetadata)
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
				const sentinel = new Error('test-owned rollback after Communication extraction')
				const rolledBack = target.transaction(async function extractThenRollback(tx) {
					await expect(tx.lifecycle.extract.ied(params)).resolves.toEqual({ warnings: [] })
					throw sentinel
				})
				await expect(rolledBack).rejects.toBeInstanceOf(Error)
				const rejection = await rolledBack.catch((error: unknown) => error)
				const reported = toDialecteError(rejection)
				expect(reported?.key).toBe('UNKNOWN')
				expect(reported?.cause).toBe(sentinel)
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
			await expect(extraction).resolves.toEqual({ warnings: [] })
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
