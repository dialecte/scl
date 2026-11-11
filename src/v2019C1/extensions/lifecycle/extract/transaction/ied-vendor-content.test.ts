/// <reference types="vite/client" />

import SelectedIedWithVendorInputsAndExtrefBesideSclInputsXml from './fixtures/selected-ied-with-vendor-inputs-and-extref-beside-scl-inputs.xml?raw'
import SelectedIedWithVendorReferenceNamesBesideForeignReferencesXml from './fixtures/selected-ied-with-vendor-reference-names-beside-foreign-references.xml?raw'
import SelectedIedWithVendorSupervisionNamesBesideLgosAndLsvsXml from './fixtures/selected-ied-with-vendor-supervision-names-beside-lgos-and-lsvs.xml?raw'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	assertExpectedElementQueries,
	collectSclOutputViolations,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { ExtractWarning } from './extract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expectedWarnings: ExtractWarning[]
	vendorQueries: string[]
	sourceQueries: string[]
}

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`
const retainedQueries = [
	'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"]',
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.payload"]/*[local-name()="Keep"][namespace-uri()="urn:ied-vendor-content:test"][@mode="retained"][text()="unrelated vendor payload"]',
	'//default:LDevice[@inst="LD1"]/default:LN[@lnClass="PTOC"][@inst="1"][@uuid="50000000-0000-4000-8000-000000000001"]/default:DOI[@name="Status"]/default:DAI[@name="stVal"]/default:Val[text()="true"]',
]
const absentQueries = [
	'//default:Inputs',
	'//default:ExtRef',
	'//default:LN[@lnClass="LGOS" or @lnClass="LSVS"]',
	'//default:IEDName[text()="Foreign"]',
	'//default:ClientLN[@iedName="Foreign"]',
	'//default:Association[@iedName="Foreign"]',
	'//default:KDC[@iedName="Foreign"]',
	'//default:IED[@name="Foreign"]',
]
const inputSourceQueries = [
	'/default:SCL[count(.//default:Inputs)=1][count(.//default:ExtRef)=1]/default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"]/default:Server/default:LDevice[@inst="LD1"]/default:LN[@lnClass="PTOC"][@inst="1"]/default:Inputs[count(default:ExtRef)=1]/default:ExtRef[@iedName="Selected"][@doName="Status"][@daName="stVal"]',
]
const inputVendorQueries = [
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.payload"][count(*[namespace-uri()="urn:ied-vendor-content:test"])=3]/*[local-name()="Inputs"][namespace-uri()="urn:ied-vendor-content:test"][@mode="opaque"][count(*)=1]/*[local-name()="ExtRef"][namespace-uri()="urn:ied-vendor-content:test"][@iedName="Foreign"][@intAddr="nested"][text()="nested vendor reference"]',
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.payload"]/*[local-name()="ExtRef"][namespace-uri()="urn:ied-vendor-content:test"][@iedName="Foreign"][@intAddr="standalone"][text()="standalone vendor reference"]',
]
const supervisionVendorQueries = [
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.payload"][count(*[local-name()="LN"][namespace-uri()="urn:ied-vendor-content:test"])=2]/*[local-name()="LN"][namespace-uri()="urn:ied-vendor-content:test"][@lnClass="LGOS"][@inst="vendorG"][text()="vendor GOOSE data"]',
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.payload"]/*[local-name()="LN"][namespace-uri()="urn:ied-vendor-content:test"][@lnClass="LSVS"][@inst="vendorS"][text()="vendor sampled data"]',
]
const referenceVendorQueries = [
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.payload"][count(*[namespace-uri()="urn:ied-vendor-content:test"])=5]/*[local-name()="IEDName"][namespace-uri()="urn:ied-vendor-content:test"][@mode="opaque"][text()="Foreign"]',
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.payload"]/*[local-name()="ClientLN"][namespace-uri()="urn:ied-vendor-content:test"][@iedName="Foreign"][@mode="opaque"][text()="vendor client"]',
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.payload"]/*[local-name()="Association"][namespace-uri()="urn:ied-vendor-content:test"][@iedName="Foreign"][@mode="opaque"][text()="vendor association"]',
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.payload"]/*[local-name()="KDC"][namespace-uri()="urn:ied-vendor-content:test"][@iedName="Foreign"][@mode="opaque"][text()="vendor key data"]',
]

describe('extract IED preserves opaque vendor names', () => {
	const testCases: Record<string, TestCase> = {
		'Vendor Inputs and ExtRef beside SCL Inputs -> vendor subtree retained without warnings': {
			sourceXml: SelectedIedWithVendorInputsAndExtrefBesideSclInputsXml,
			targetXml: emptyTarget,
			expectedWarnings: [],
			vendorQueries: inputVendorQueries,
			sourceQueries: inputSourceQueries,
			expectedQueries: [...retainedQueries, ...inputVendorQueries],
			unexpectedQueries: absentQueries,
		},
		'Vendor supervision names beside SCL supervision -> only real logical nodes omitted and warned':
			{
				sourceXml: SelectedIedWithVendorSupervisionNamesBesideLgosAndLsvsXml,
				targetXml: emptyTarget,
				expectedWarnings: [
					{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'real-lgos' } },
					{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'real-lsvs' } },
				],
				vendorQueries: supervisionVendorQueries,
				sourceQueries: [
					...inputSourceQueries,
					'//default:LDevice[@inst="LD1"][count(default:LN[@lnClass="LGOS"])=1][count(default:LN[@lnClass="LSVS"])=1]',
				],
				expectedQueries: [...retainedQueries, ...supervisionVendorQueries],
				unexpectedQueries: absentQueries,
			},
		'Vendor foreign reference names beside SCL references -> only real foreign references omitted and warned':
			{
				sourceXml: SelectedIedWithVendorReferenceNamesBesideForeignReferencesXml,
				targetXml: emptyTarget,
				expectedWarnings: [
					{
						code: 'ied-reference-left-out',
						source: { tagName: 'IEDName', id: 'real-receiver' },
						iedName: 'Foreign',
					},
					{
						code: 'ied-reference-left-out',
						source: { tagName: 'ClientLN', id: 'real-client' },
						iedName: 'Foreign',
					},
					{
						code: 'ied-reference-left-out',
						source: { tagName: 'Association', id: 'real-association' },
						iedName: 'Foreign',
					},
					{
						code: 'ied-reference-left-out',
						source: { tagName: 'KDC', id: 'real-kdc' },
						iedName: 'Foreign',
					},
				],
				vendorQueries: referenceVendorQueries,
				sourceQueries: [
					...inputSourceQueries,
					'//default:IED[@name="Selected"][count(.//default:IEDName[text()="Foreign"])=1][count(.//default:ClientLN[@iedName="Foreign"])=1][count(.//default:Association[@iedName="Foreign"])=1][count(default:KDC[@iedName="Foreign"])=1]',
				],
				expectedQueries: [...retainedQueries, ...referenceVendorQueries],
				unexpectedQueries: absentQueries,
			},
	}

	async function act({
		project,
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const runnerSourceInfo = await source.query.getDocumentInfo()
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'project.scd', { type: 'text/xml' }),
			{ configKey: runnerSourceInfo.configKey, useCustomRecordsIds: true },
		)
		const actualSource = project.openDocument(imported.documentId)
		const sourceMetadata = await actualSource.query.getDocumentInfo()
		expect(sourceMetadata.extension).toBe('.scd')
		const sourceReport = await collectSclOutputViolations({ project, document: actualSource })
		expect(sourceReport.violations).toEqual([])
		const sourceBefore = await actualSource.query.getSnapshot({ as: 'xml' })
		const sourceMetadataBefore = structuredClone(sourceMetadata)
		assertExpectedElementQueries({
			xml: sourceBefore,
			queries: [...testCase.vendorQueries, ...testCase.sourceQueries],
		})
		const params = {
			sourceQuery: actualSource.query,
			iedRef: { tagName: 'IED', id: 'selected-ied' },
			fileType: 'ISD',
			kind: 'instance',
			inputs: 'none',
			issuer: 'TEST_ISSUER',
			tool: 'TEST',
			who: 'test',
		} as const

		try {
			const extraction = target.transaction(async function extract(tx) {
				return tx.lifecycle.extract.ied(params)
			})
			await expect(extraction).resolves.toEqual({
				warnings: expect.arrayContaining(testCase.expectedWarnings),
			})
			const result = await extraction
			expect(result.warnings).toHaveLength(testCase.expectedWarnings.length)
			const targetAfter = await target.query.getSnapshot({ as: 'xml' })
			expect(function assertVendorPayload() {
				assertExpectedElementQueries({ xml: targetAfter, queries: testCase.vendorQueries })
			}).not.toThrow()
		} finally {
			const sourceAfter = await actualSource.query.getSnapshot({ as: 'xml' })
			const sourceMetadataAfter = await actualSource.query.getDocumentInfo()
			expect(sourceAfter).toBe(sourceBefore)
			expect(sourceMetadataAfter).toEqual(sourceMetadataBefore)
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
