/// <reference types="vite/client" />

import SelectedIedWithASelfInputOnLn0Xml from './fixtures/selected-ied-with-a-self-input-on-ln0.xml?raw'
import SelectedIedWithAnInputOnLnFedByPublisherXml from './fixtures/selected-ied-with-an-input-on-ln-fed-by-publisher.xml?raw'
import SelectedIedWithInputsAcrossTwoAccessPointsXml from './fixtures/selected-ied-with-inputs-across-two-access-points.xml?raw'

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
	locations: { inputId: string; parentId: string; parentTag: 'LN0' | 'LN'; refs: number }[]
	boundSelf: number
	boundExternal: number
	unbound: number
	rollbackFirst?: boolean
}

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`
const retainedQueries = [
	'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"]',
	'//default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"]/default:Server/default:LDevice[@inst="LD1"][count(default:LN0)=1][count(default:LN)=1]/default:LN0[@lnClass="LLN0"][@uuid="50000000-0000-4000-8000-000000000001"][@lnType="LLN0_Type"]',
	'//default:LDevice[@inst="LD1"]/default:LN[@lnClass="PTOC"][@inst="1"][@uuid="50000000-0000-4000-8000-000000000002"][@lnType="PTOC_Type"]/default:DOI[@name="Status"]/default:DAI[@name="stVal"]/default:Val[text()="true"]',
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.outside"]/*[local-name()="Settings"][namespace-uri()="urn:ied-inputs:test"][@mode="retained"][text()="outside payload"]',
]
const absentQueries = [
	'//default:Inputs',
	'//default:ExtRef',
	'//default:IED[@name="Publisher"]',
	'//default:Private[@type="vendor.inside"]',
]

describe('extract IED with inputs none', () => {
	const testCases: Record<string, TestCase> = {
		'LN0 self input -> whole wrapper omitted with parent and sibling retained': {
			sourceXml: SelectedIedWithASelfInputOnLn0Xml,
			targetXml: emptyTarget,
			locations: [{ inputId: 'ln0-inputs', parentId: 'selected-ln0', parentTag: 'LN0', refs: 1 }],
			boundSelf: 1,
			boundExternal: 0,
			unbound: 0,
			expectedQueries: [
				...retainedQueries,
				'//default:IED[@name="Selected"][count(default:AccessPoint)=1]',
			],
			unexpectedQueries: absentQueries,
		},
		'Ordinary LN external input -> wrapper omitted without dependency warning': {
			sourceXml: SelectedIedWithAnInputOnLnFedByPublisherXml,
			targetXml: emptyTarget,
			locations: [{ inputId: 'ln-inputs', parentId: 'selected-ln', parentTag: 'LN', refs: 1 }],
			boundSelf: 0,
			boundExternal: 1,
			unbound: 0,
			expectedQueries: [
				...retainedQueries,
				'//default:IED[@name="Selected"][count(default:AccessPoint)=1]',
			],
			unexpectedQueries: absentQueries,
		},
		'Inputs across two access points -> all wrappers omitted with unrelated vendor content retained':
			{
				sourceXml: SelectedIedWithInputsAcrossTwoAccessPointsXml,
				targetXml: emptyTarget,
				locations: [
					{ inputId: 'ln0-inputs', parentId: 'selected-ln0', parentTag: 'LN0', refs: 2 },
					{ inputId: 'ln-inputs', parentId: 'selected-ln', parentTag: 'LN', refs: 1 },
					{ inputId: 'second-ln0-inputs', parentId: 'second-ln0', parentTag: 'LN0', refs: 1 },
					{ inputId: 'second-ln-inputs', parentId: 'second-ln', parentTag: 'LN', refs: 1 },
				],
				boundSelf: 2,
				boundExternal: 1,
				unbound: 2,
				rollbackFirst: true,
				expectedQueries: [
					...retainedQueries,
					'//default:IED[@name="Selected"][count(default:AccessPoint)=2]/default:AccessPoint[@name="AP2"][@uuid="30000000-0000-4000-8000-000000000002"]/default:Server/default:LDevice[@inst="LD2"][count(default:LN0)=1][count(default:LN)=1]/default:LN0[@lnClass="LLN0"][@uuid="50000000-0000-4000-8000-000000000004"]',
					'//default:LDevice[@inst="LD2"]/default:LN[@lnClass="PTOC"][@inst="2"][@uuid="50000000-0000-4000-8000-000000000005"][@lnType="PTOC_Type"]',
				],
				unexpectedQueries: [...absentQueries, '//default:Text[text()="input-only text"]'],
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
		const sourceInputs = await actualSource.query.getRecordsByTagName('Inputs')
		const sourceRefs = await actualSource.query.getRecordsByTagName('ExtRef')
		expect(sourceInputs).toHaveLength(testCase.locations.length)
		expect(sourceInputs.length).toBeGreaterThan(0)
		expect(sourceRefs).toHaveLength(testCase.boundSelf + testCase.boundExternal + testCase.unbound)
		expect(sourceRefs.length).toBeGreaterThan(0)
		for (const location of testCase.locations) {
			const input = await actualSource.query.getRecord({ tagName: 'Inputs', id: location.inputId })
			expect(input).toBeDefined()
			const ancestors = await actualSource.query.findAncestors(input)
			const parent = ancestors[0]
			expect(parent).toMatchObject({ tagName: location.parentTag, id: location.parentId })
			const refs = await actualSource.query.getChildren(input, 'ExtRef')
			expect(refs).toHaveLength(location.refs)
		}
		const referenceNames = []
		for (const reference of sourceRefs) {
			const name = await actualSource.query.getAttribute(reference, {
				name: 'iedName',
				defaults: 'none',
				fullObject: true,
			})
			referenceNames.push(name?.value)
		}
		expect(referenceNames.filter((name) => name === 'Selected')).toHaveLength(testCase.boundSelf)
		expect(referenceNames.filter((name) => name === 'Publisher')).toHaveLength(
			testCase.boundExternal,
		)
		expect(referenceNames.filter((name) => name === undefined)).toHaveLength(testCase.unbound)
		const sourceBefore = await actualSource.query.getSnapshot({ as: 'xml' })
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
		} as const

		try {
			if (testCase.rollbackFirst) {
				const sentinel = new Error('test-owned rollback after Inputs omission')
				const rolledBack = target.transaction(async function extractThenRollback(tx) {
					await expect(tx.lifecycle.extract.ied(params)).resolves.toEqual({ warnings: [] })
					const stagedInputs = await tx.getRecordsByTagName('Inputs')
					const stagedRefs = await tx.getRecordsByTagName('ExtRef')
					const stagedIeds = await tx.getRecordsByTagName('IED')
					expect(stagedInputs).toHaveLength(0)
					expect(stagedRefs).toHaveLength(0)
					expect(stagedIeds).toHaveLength(1)
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
			const extraction = target.transaction(async function extract(tx) {
				return tx.lifecycle.extract.ied(params)
			})
			await expect(extraction).resolves.toEqual({ warnings: [] })
			const targetInputs = await target.query.getRecordsByTagName('Inputs')
			const targetRefs = await target.query.getRecordsByTagName('ExtRef')
			expect(targetInputs).toHaveLength(0)
			expect(targetRefs).toHaveLength(0)
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
