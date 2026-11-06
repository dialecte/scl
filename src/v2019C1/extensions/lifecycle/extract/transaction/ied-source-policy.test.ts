import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	collectSclOutputViolations,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	sourceExtension: '.ssd' | '.scd' | '.xml' | '' | '.bogus'
	sourceHeaderType?: 'SSD' | 'SCD'
	expectedSourceType?: 'SSD' | 'SCD'
	unsupported?: boolean
}

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="source-root">
		<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B" ${id}="source-header"/>
		<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
			<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001"/>
		</IED>
	</SCL>
`

const successQueries = [
	'/default:SCL[count(default:Header)=1]/default:Header[@fileType="ISD"]/default:SourceFiles[count(default:SclFileReference)=1]',
	'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"]/default:IEDSourceFiles[count(default:SclFileReference)=1]',
]

describe('extract IED source extension policy', () => {
	const testCases: Record<string, TestCase> = {
		'.ssd source with SCD Header -> SSD provenance': {
			sourceXml,
			targetXml: emptyTarget,
			sourceExtension: '.ssd',
			sourceHeaderType: 'SCD',
			expectedSourceType: 'SSD',
			expectedQueries: successQueries,
		},
		'.scd source with SSD Header -> SCD provenance': {
			sourceXml: sourceXml.replace('fileType="SCD"', 'fileType="SSD"'),
			targetXml: emptyTarget,
			sourceExtension: '.scd',
			sourceHeaderType: 'SSD',
			expectedSourceType: 'SCD',
			expectedQueries: successQueries,
		},
		'.xml source without Header type -> SCD provenance': {
			sourceXml: sourceXml.replace(' fileType="SCD"', ''),
			targetXml: emptyTarget,
			sourceExtension: '.xml',
			expectedSourceType: 'SCD',
			expectedQueries: successQueries,
		},
		'.xml source with SSD Header -> SCD provenance': {
			sourceXml: sourceXml.replace('fileType="SCD"', 'fileType="SSD"'),
			targetXml: emptyTarget,
			sourceExtension: '.xml',
			sourceHeaderType: 'SSD',
			expectedSourceType: 'SCD',
			expectedQueries: successQueries,
		},
		'Actual extensionless source without Header type -> SCD provenance': {
			sourceXml: sourceXml.replace(' fileType="SCD"', ''),
			targetXml: emptyTarget,
			sourceExtension: '',
			expectedSourceType: 'SCD',
			expectedQueries: successQueries,
		},
		'Actual extensionless source with SSD Header -> SCD provenance': {
			sourceXml: sourceXml.replace('fileType="SCD"', 'fileType="SSD"'),
			targetXml: emptyTarget,
			sourceExtension: '',
			sourceHeaderType: 'SSD',
			expectedSourceType: 'SCD',
			expectedQueries: successQueries,
		},
		'.bogus source with SSD Header -> unsupported source extension without changes': {
			sourceXml: sourceXml.replace('fileType="SCD"', 'fileType="SSD"'),
			targetXml: emptyTarget,
			sourceExtension: '.bogus',
			sourceHeaderType: 'SSD',
			unsupported: true,
			expectedQueries: ['/default:SCL[count(*)=0]'],
			unexpectedQueries: ['/default:SCL/default:IED', '/default:SCL/default:Header'],
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
		let actualSource = source
		let iedRef: Scl.Ref<'IED'> = { tagName: 'IED', id: 'selected-ied' }
		if (testCase.sourceExtension === '' || testCase.sourceExtension === '.bogus') {
			const documentId = await project.initEmptyDocument({
				configKey: runnerSourceInfo.configKey,
				name: testCase.sourceExtension === '' ? 'extensionless' : 'unsupported',
				extension: testCase.sourceExtension,
			})
			actualSource = project.openDocument(documentId)
			iedRef = await actualSource.transaction(async function buildSource(tx) {
				const root = await tx.getRoot()
				await tx.addChild(root, {
					tagName: 'Header',
					attributes: {
						id: 'ProjectSource',
						uuid: '10000000-0000-4000-8000-000000000001',
						version: '2',
						revision: 'B',
						...(testCase.sourceHeaderType ? { fileType: testCase.sourceHeaderType } : {}),
					},
				})
				const selectedIed = await tx.addChild(root, {
					tagName: 'IED',
					attributes: {
						name: 'Selected',
						uuid: '20000000-0000-4000-8000-000000000001',
					},
				})
				await tx.addChild(selectedIed, {
					tagName: 'AccessPoint',
					attributes: {
						name: 'AP1',
						uuid: '30000000-0000-4000-8000-000000000001',
					},
				})
				return { tagName: 'IED', id: selectedIed.id } as const
			})
		} else {
			const imported = await project.importFile(
				new File([testCase.sourceXml], `project${testCase.sourceExtension}`, {
					type: 'text/xml',
				}),
				{ configKey: runnerSourceInfo.configKey, useCustomRecordsIds: true },
			)
			actualSource = project.openDocument(imported.documentId)
		}
		const sourceMetadata = await actualSource.query.getDocumentInfo()
		expect(sourceMetadata.extension).toBe(testCase.sourceExtension)
		const selectedName = await actualSource.query.getAttribute(iedRef, { name: 'name' })
		expect(selectedName).toBe('Selected')
		const sourceHeaders = await actualSource.query.getRecordsByTagName('Header')
		expect(sourceHeaders).toHaveLength(1)
		const preparedHeaderType = await actualSource.query.getAttribute(sourceHeaders[0], {
			name: 'fileType',
			defaults: 'none',
			fullObject: true,
		})
		expect(preparedHeaderType?.value).toBe(testCase.sourceHeaderType)
		const sourceReport = await collectSclOutputViolations({ project, document: actualSource })
		expect(sourceReport.violations).toEqual([])
		const sourceBefore = await actualSource.query.getSnapshot({ as: 'xml' })
		const sourceMetadataBefore = structuredClone(sourceMetadata)
		const targetBefore = await target.query.getSnapshot({ as: 'xml' })
		const targetMetadata = await target.query.getDocumentInfo()
		const targetMetadataBefore = structuredClone(targetMetadata)
		const params = {
			sourceQuery: actualSource.query,
			iedRef,
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
			if (testCase.unsupported) {
				await expect(extraction).rejects.toBeInstanceOf(Error)
				const rejection = await extraction.catch((error: unknown) => error)
				const reported = toDialecteError(rejection)
				expect({ key: reported?.key, meta: reported?.meta }).toEqual({
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'sourceExtension', value: '.bogus' },
				})
				const targetAfter = await target.query.getSnapshot({ as: 'xml' })
				const targetMetadataAfter = await target.query.getDocumentInfo()
				expect(targetAfter).toBe(targetBefore)
				expect(targetMetadataAfter).toEqual(targetMetadataBefore)
			} else {
				await expect(extraction).resolves.toEqual({ warnings: [] })
				const provenance = await target.query.reference.getProvenance()
				expect(provenance).toHaveLength(2)
				expect(provenance.map((reference) => reference.anchor.kind).sort()).toEqual([
					'document',
					'ied',
				])
				for (const reference of provenance) {
					expect(reference).toMatchObject({
						fileType: testCase.expectedSourceType,
						fileUuid: '10000000-0000-4000-8000-000000000001',
						fileName: sourceMetadataBefore.name,
						version: '2',
						revision: 'B',
					})
					if (reference.anchor.kind === 'ied') {
						const anchorName = await target.query.getAttribute(reference.anchor.ref, {
							name: 'name',
						})
						expect(anchorName).toBe('Selected')
					} else {
						const headerType = await target.query.getAttribute(reference.anchor.ref, {
							name: 'fileType',
						})
						expect(headerType).toBe('ISD')
					}
				}
			}
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
