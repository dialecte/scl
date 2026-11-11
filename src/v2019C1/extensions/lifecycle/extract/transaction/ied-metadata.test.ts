/// <reference types="vite/client" />

import SelectedIedImplementedFromAnIidXml from './fixtures/selected-ied-implemented-from-an-iid.xml?raw'
import SelectedIedSpecifiedByTheSourceScdBesideAnUnrelatedIedXml from './fixtures/selected-ied-specified-by-the-source-scd-beside-an-unrelated-ied.xml?raw'
import SelectedIedUnderAHeaderWithoutFileTypeXml from './fixtures/selected-ied-under-a-header-without-file-type.xml?raw'
import SelectedIedWithoutProvenanceXml from './fixtures/selected-ied-without-provenance.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	collectSclOutputViolations,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expectedSourceType?: 'SSD' | 'SCD'
	expectedFileName?: string
	expectedRefusal?: string
	rollbackFirst?: boolean
}

type ImportedSourceCase = TestCase & { sourceFilename: 'project.ssd' | 'project.scd' }

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`
const successQueries = [
	'/default:SCL[count(default:Header)=1]/default:Header[@fileType="ISD"][string-length(@id)>0][@version="0"][@revision="1"][@toolID="TEST"][@uuid!="10000000-0000-4000-8000-000000000001"]/default:History[count(default:Hitem)=1]/default:Hitem[@who="test"][@version="0"][@revision="1"][string-length(@when)>0]',
	'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"][@manufacturer="TEST_ISSUER"]',
	'/default:SCL/default:Header/default:SourceFiles[count(default:SclFileReference)=1]',
]
const absentQueries = ['//default:MinRequestedSCDFiles', '//default:IED[@name="Unrelated"]']

describe('extract IED metadata and guards', () => {
	const testCases: Record<string, TestCase> = {
		'Known SCD specification -> new ISD header, issuer and both provenance anchors': {
			sourceXml: SelectedIedSpecifiedByTheSourceScdBesideAnUnrelatedIedXml,
			targetXml: emptyTarget,
			expectedSourceType: 'SCD',
			expectedFileName: 'source.xml',
			rollbackFirst: true,
			expectedQueries: [
				...successQueries,
				'//default:IED[@name="Selected"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[@fileType="ISD"][@fileName="older"][@fileUuid="10000000-0000-4000-8000-000000000002"][@version="1"][@revision="A"]',
			],
			unexpectedQueries: absentQueries,
		},
		'Selected implemented IED -> structured refusal without changes': {
			sourceXml: SelectedIedImplementedFromAnIidXml,
			targetXml: emptyTarget,
			expectedRefusal: 'IED_NOT_SPECIFICATION',
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		'Target already contains an IED -> structured refusal without changes': {
			sourceXml: SelectedIedWithoutProvenanceXml,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root">
					<IED name="Existing" uuid="20000000-0000-4000-8000-000000000003">
						<AccessPoint name="ExistingAP"/>
					</IED>
				</SCL>
			`,
			expectedRefusal: 'EXTRACTION_TARGET_NOT_EMPTY',
			expectedQueries: [
				'/default:SCL[count(default:IED)=1]/default:IED[@name="Existing"][@uuid="20000000-0000-4000-8000-000000000003"]/default:AccessPoint[@name="ExistingAP"]',
			],
			unexpectedQueries: ['//default:IED[@name="Selected"]'],
		},
	}

	const importedSourceCases: Record<string, ImportedSourceCase> = {
		'Missing Header fileType in .ssd source -> SSD provenance at both anchors': {
			sourceXml: SelectedIedUnderAHeaderWithoutFileTypeXml,
			targetXml: emptyTarget,
			sourceFilename: 'project.ssd',
			expectedSourceType: 'SSD',
			expectedFileName: 'project.ssd',
			expectedQueries: [
				...successQueries,
				'//default:IED[@name="Selected"]/default:IEDSourceFiles[count(default:SclFileReference)=1]',
			],
			unexpectedQueries: absentQueries,
		},
		'Missing Header fileType in .scd source -> SCD provenance at both anchors': {
			sourceXml: SelectedIedUnderAHeaderWithoutFileTypeXml,
			targetXml: emptyTarget,
			sourceFilename: 'project.scd',
			expectedSourceType: 'SCD',
			expectedFileName: 'project.scd',
			expectedQueries: [
				...successQueries,
				'//default:IED[@name="Selected"]/default:IEDSourceFiles[count(default:SclFileReference)=1]',
			],
			unexpectedQueries: absentQueries,
		},
	}

	const revisionStartCases: Record<string, TestCase> = {
		'Requested revision start -> OPTION_NOT_AVAILABLE without changes': {
			sourceXml: SelectedIedWithoutProvenanceXml,
			targetXml: emptyTarget,
			expectedRefusal: 'OPTION_NOT_AVAILABLE',
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
	}

	/** Extracts from `source`, checks the outcome the case states, and returns the refusal when there is one. */
	async function extractAndCheck(extraction: {
		source: SclTest.ActParams<TestCase>['source']
		target: NonNullable<SclTest.ActParams<TestCase>['target']>
		testCase: TestCase
		as?: 'revision'
	}): Promise<ReturnType<typeof toDialecteError>> {
		const { source: actualSource, target, testCase, as } = extraction
		const sourceBefore = await actualSource.query.getSnapshot({ as: 'xml' })
		const sourceMetadata = await actualSource.query.getDocumentInfo()
		const sourceMetadataBefore = structuredClone(sourceMetadata)
		const targetBefore = await target.query.getSnapshot({ as: 'xml' })
		const targetMetadata = await target.query.getDocumentInfo()
		const targetMetadataBefore = structuredClone(targetMetadata)
		const params = {
			sourceQuery: actualSource.query,
			iedRef: { tagName: 'IED', id: 'selected-ied' },
			fileType: 'ISD',
			kind: 'instance',
			inputs: 'none',
			issuer: 'TEST_ISSUER',
			tool: 'TEST',
			who: 'test',
			...(as ? { as } : {}),
		} as const

		try {
			if (testCase.rollbackFirst) {
				const sentinel = new Error('test-owned rollback after metadata initialization')
				const rolledBack = target.transaction(async function extractThenRollback(tx) {
					await expect(tx.lifecycle.extract.ied(params)).resolves.toEqual({ warnings: [] })
					const headers = await tx.getRecordsByTagName('Header')
					expect(headers).toHaveLength(1)
					const headerType = await tx.getAttribute(headers[0], { name: 'fileType' })
					expect(headerType).toBe('ISD')
					const references = await tx.getRecordsByTagName('SclFileReference')
					const currentReferences = []
					for (const reference of references) {
						const attributes = await tx.getAttributes(reference)
						if (attributes.fileUuid === '10000000-0000-4000-8000-000000000001') {
							currentReferences.push(attributes)
						}
					}
					expect(currentReferences).toHaveLength(2)
					for (const attributes of currentReferences) {
						expect(attributes).toMatchObject({
							fileType: 'SCD',
							fileName: testCase.expectedFileName,
							version: '2',
							revision: 'B',
						})
					}
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
				const sourceAfterRollback = await actualSource.query.getSnapshot({ as: 'xml' })
				const sourceMetadataAfterRollback = await actualSource.query.getDocumentInfo()
				expect(sourceAfterRollback).toBe(sourceBefore)
				expect(sourceMetadataAfterRollback).toEqual(sourceMetadataBefore)
			}
			if (testCase.expectedRefusal) {
				const outcome = await target.transaction(async function exportIsd(tx) {
					const stagedBefore = [...tx.getStagedOperations()]
					const refused = await tx.lifecycle.extract.ied(params).then(
						() => undefined,
						(error: unknown) => error,
					)
					return { refused, stagedBefore, stagedAfter: [...tx.getStagedOperations()] }
				})
				expect(outcome.refused).toBeInstanceOf(Error)
				const reported = toDialecteError(outcome.refused)
				expect(reported?.key).toBe(testCase.expectedRefusal)
				expect(outcome.stagedAfter).toEqual(outcome.stagedBefore)
				const targetAfter = await target.query.getSnapshot({ as: 'xml' })
				const targetMetadataAfter = await target.query.getDocumentInfo()
				expect(targetAfter).toBe(targetBefore)
				expect(targetMetadataAfter).toEqual(targetMetadataBefore)
				return reported
			}
			const extracted = target.transaction(async function extract(tx) {
				return tx.lifecycle.extract.ied(params)
			})
			await expect(extracted).resolves.toEqual({ warnings: [] })
			const headers = await target.query.getRecordsByTagName('Header')
			expect(headers).toHaveLength(1)
			const headerUuid = await target.query.getAttribute(headers[0], { name: 'uuid' })
			expect(headerUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
			expect(headerUuid).not.toBe('10000000-0000-4000-8000-000000000001')
			const provenance = await target.query.reference.getProvenance()
			const currentReferences = provenance.filter(
				(reference) => reference.fileUuid === '10000000-0000-4000-8000-000000000001',
			)
			expect(currentReferences).toHaveLength(2)
			expect(currentReferences.map((reference) => reference.anchor.kind).sort()).toEqual([
				'document',
				'ied',
			])
			for (const reference of currentReferences) {
				expect(reference).toMatchObject({
					fileType: testCase.expectedSourceType,
					fileUuid: '10000000-0000-4000-8000-000000000001',
					fileName: testCase.expectedFileName,
					version: '2',
					revision: 'B',
				})
				const anchorName = await target.query.getAttribute(reference.anchor.ref, {
					name: reference.anchor.kind === 'ied' ? 'name' : 'fileType',
				})
				expect(anchorName).toBe(reference.anchor.kind === 'ied' ? 'Selected' : 'ISD')
			}
			expect(provenance).toHaveLength(testCase.rollbackFirst ? 3 : 2)
			const classifications = await target.query.lifecycle.classifyIeds()
			expect(classifications).toEqual([
				{
					ied: expect.objectContaining({ tagName: 'IED' }),
					name: 'Selected',
					kind: 'specification',
					basis: 'no-provenance',
				},
			])
			const minimumScdFiles = await target.query.getRecordsByTagName('MinRequestedSCDFiles')
			expect(minimumScdFiles).toHaveLength(0)
			return undefined
		} finally {
			const sourceAfter = await actualSource.query.getSnapshot({ as: 'xml' })
			const sourceMetadataAfter = await actualSource.query.getDocumentInfo()
			expect(sourceAfter).toBe(sourceBefore)
			expect(sourceMetadataAfter).toEqual(sourceMetadataBefore)
		}
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await extractAndCheck({ source, target, testCase })
		return { assertOn: 'target' }
	}

	async function importSourceThenExtract({
		project,
		target,
		testCase,
	}: SclTest.ActParams<ImportedSourceCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], testCase.sourceFilename, { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const importedSource = project.openDocument(imported.documentId)
		const importedMetadata = await importedSource.query.getDocumentInfo()
		expect(importedMetadata.extension).toBe(
			testCase.sourceFilename === 'project.ssd' ? '.ssd' : '.scd',
		)
		const sourceReport = await collectSclOutputViolations({ project, document: importedSource })
		expect(sourceReport.violations).toEqual([])
		await extractAndCheck({ source: importedSource, target, testCase })
		return { assertOn: 'target' }
	}

	async function requestRevisionStart({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const reported = await extractAndCheck({ source, target, testCase, as: 'revision' })
		expect(reported?.meta).toEqual({ option: 'as', value: 'revision' })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
	runSclTestCases.withExport({ testCases: importedSourceCases, act: importSourceThenExtract })
	runSclTestCases.withExport({ testCases: revisionStartCases, act: requestRevisionStart })
})
