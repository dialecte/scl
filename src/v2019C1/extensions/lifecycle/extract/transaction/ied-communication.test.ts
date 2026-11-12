/// <reference types="vite/client" />

import SelectedIedConnectedByNamesOnlyXml from './fixtures/selected-ied-connected-by-names-only.xml?raw'
import SelectedIedConnectedOnAStationBusAndAProcessBusXml from './fixtures/selected-ied-connected-on-a-station-bus-and-a-process-bus.xml?raw'
import SelectedIedNamedByAVendorConnectionInANetworkXml from './fixtures/selected-ied-named-by-a-vendor-connection-in-a-network.xml?raw'
import SelectedIedNamedByAVendorConnectionInAPrivateXml from './fixtures/selected-ied-named-by-a-vendor-connection-in-a-private.xml?raw'
import SelectedIedOnAStationBusBesideAForeignProcessBusXml from './fixtures/selected-ied-on-a-station-bus-beside-a-foreign-process-bus.xml?raw'
import SelectedIedSharingAStationBusWithAForeignIedXml from './fixtures/selected-ied-sharing-a-station-bus-with-a-foreign-ied.xml?raw'
import SelectedIedUnconnectedBesideAForeignBusXml from './fixtures/selected-ied-unconnected-beside-a-foreign-bus.xml?raw'
import SelectedIedWithAFullStationBusConnectionXml from './fixtures/selected-ied-with-a-full-station-bus-connection.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

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
			sourceXml: SelectedIedConnectedOnAStationBusAndAProcessBusXml,
			targetXml: emptyTarget,
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
			sourceXml: SelectedIedSharingAStationBusWithAForeignIedXml,
			targetXml: emptyTarget,
			expectedQueries: [
				...selectedQueries,
				'/default:SCL[count(default:Communication)=1]/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"][@apUuid="30000000-0000-4000-8000-000000000001"]',
			],
			unexpectedQueries: foreignQueries,
		},
		'Unrelated foreign network -> whole network excluded': {
			sourceXml: SelectedIedOnAStationBusBesideAForeignProcessBusXml,
			targetXml: emptyTarget,
			expectedQueries: [
				...selectedQueries,
				'/default:SCL[count(default:Communication)=1]/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"][@apUuid="30000000-0000-4000-8000-000000000001"]',
			],
			unexpectedQueries: [...foreignQueries, '//default:SubNetwork[@name="ProcessBus"]'],
		},
		'No selected connection -> Communication absent': {
			sourceXml: SelectedIedUnconnectedBesideAForeignBusXml,
			targetXml: emptyTarget,
			expectedQueries: [...selectedQueries, '/default:SCL[count(default:Communication)=0]'],
			unexpectedQueries: [...foreignQueries, '/default:SCL/default:Communication'],
		},
		'Vendor ConnectedAP inside a Private naming the selected IED, no native connection -> network and Communication not exported':
			{
				sourceXml: SelectedIedNamedByAVendorConnectionInAPrivateXml,
				targetXml: emptyTarget,
				expectedQueries: [...selectedQueries, '/default:SCL[count(default:Communication)=0]'],
				unexpectedQueries: [
					...foreignQueries,
					'//default:SubNetwork[@name="VendorBus"]',
					'//*[local-name()="ConnectedAP"][namespace-uri()="urn:ied-communication:test"]',
				],
			},
		'Vendor ConnectedAP directly in a network naming the selected IED, no native connection -> network and Communication not exported':
			{
				sourceXml: SelectedIedNamedByAVendorConnectionInANetworkXml,
				targetXml: emptyTarget,
				expectedQueries: [...selectedQueries, '/default:SCL[count(default:Communication)=0]'],
				unexpectedQueries: [
					...foreignQueries,
					'//default:SubNetwork[@name="VendorBus"]',
					'//*[local-name()="ConnectedAP"][namespace-uri()="urn:ied-communication:test"]',
				],
			},
		'Selected communication payload -> metadata and children retained': {
			sourceXml: SelectedIedWithAFullStationBusConnectionXml,
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

	const namesOnlyCases: Record<string, TestCase> = {
		'Names-only connection -> selected without manufacturing UUID twin': {
			sourceXml: SelectedIedConnectedByNamesOnlyXml,
			targetXml: emptyTarget,
			expectedQueries: [
				...selectedQueries,
				'/default:SCL[count(default:Communication)=1]/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="Selected"][@apName="AP1"][not(@apUuid) or @apUuid=/default:SCL/default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"]/@uuid]',
			],
			unexpectedQueries: [
				...foreignQueries,
				'//default:ConnectedAP[@iedName="Selected"][@apUuid][not(@apUuid=/default:SCL/default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"]/@uuid)]',
			],
		},
	}

	async function extractSelectedIed({
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const result = await target.transaction(async function extract(tx) {
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
		expect(result).toEqual({ warnings: [] })
		return { assertOn: 'target' }
	}

	async function clearConnectionUuidThenExtract(
		params: SclTest.ActParams<TestCase>,
	): Promise<SclTest.ActResult> {
		const { source } = params
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
		return extractSelectedIed(params)
	}

	runSclTestCases.withExport({ testCases, act: extractSelectedIed })
	runSclTestCases.withExport({ testCases: namesOnlyCases, act: clearConnectionUuidThenExtract })
})
