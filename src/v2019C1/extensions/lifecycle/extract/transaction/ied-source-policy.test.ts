import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }
type ImportedCase = TestCase & { sourceFileName: string }
type CreatedCase = TestCase & { sourceName: string; sourceExtension: string }

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

const EXPORT = {
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'none',
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'test',
} as const

describe('extract IED source type, read from the source file extension', () => {
	const testCases: SclTest.TestCases<ImportedCase> = {
		'.ssd source with SCD Header -> SSD provenance': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="source-root">
					<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B" ${id}="source-header"/>
					<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
						<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001"/>
					</IED>
				</SCL>
			`,
			targetXml: emptyTarget,
			sourceFileName: 'project.ssd',
			expectedQueries: [
				'/default:SCL[count(default:Header)=1]/default:Header[@fileType="ISD"]/default:SourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SSD"][@fileName="project.ssd"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
				'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SSD"][@fileName="project.ssd"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
			],
		},
		'.scd source with SSD Header -> SCD provenance': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="source-root">
					<Header id="ProjectSource" fileType="SSD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B" ${id}="source-header"/>
					<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
						<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001"/>
					</IED>
				</SCL>
			`,
			targetXml: emptyTarget,
			sourceFileName: 'project.scd',
			expectedQueries: [
				'/default:SCL[count(default:Header)=1]/default:Header[@fileType="ISD"]/default:SourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SCD"][@fileName="project.scd"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
				'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SCD"][@fileName="project.scd"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
			],
		},
		'.xml source with SSD Header -> SCD provenance': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="source-root">
					<Header id="ProjectSource" fileType="SSD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B" ${id}="source-header"/>
					<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
						<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001"/>
					</IED>
				</SCL>
			`,
			targetXml: emptyTarget,
			sourceFileName: 'project.xml',
			expectedQueries: [
				'/default:SCL[count(default:Header)=1]/default:Header[@fileType="ISD"]/default:SourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SCD"][@fileName="project.xml"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
				'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SCD"][@fileName="project.xml"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
			],
		},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<ImportedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], testCase.sourceFileName, { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const projectFile = project.openDocument(imported.documentId)
		const result = await target.transaction(async function extract(tx) {
			return tx.lifecycle.extract.ied({
				...EXPORT,
				sourceQuery: projectFile.query,
				iedRef: { tagName: 'IED', id: 'selected-ied' },
			})
		})
		expect(result).toEqual({ warnings: [] })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extract IED source type, for a source the import does not read', () => {
	// An import refuses a file of an extension the config does not read: the case's source (Header, IED,
	// AccessPoint) is copied as it is into a document of that extension.
	async function createSourceOfExtension(params: {
		project: SclTest.ActParams<CreatedCase>['project']
		source: SclTest.ActParams<CreatedCase>['source']
		testCase: CreatedCase
	}) {
		const { project, source, testCase } = params
		const { configKey } = await source.query.getDocumentInfo()
		const [caseHeader] = await source.query.getRecordsByTagName('Header')
		const [caseIed] = await source.query.getRecordsByTagName('IED')
		const [caseAccessPoint] = await source.query.getRecordsByTagName('AccessPoint')
		const headerAttributes = await source.query.getAttributes(caseHeader, { defaults: 'none' })
		const iedAttributes = await source.query.getAttributes(caseIed, { defaults: 'none' })
		const accessPointAttributes = await source.query.getAttributes(caseAccessPoint, {
			defaults: 'none',
		})
		const documentId = await project.initEmptyDocument({
			configKey,
			name: testCase.sourceName,
			extension: testCase.sourceExtension,
		})
		const projectFile = project.openDocument(documentId)
		const iedRef = await projectFile.transaction(async function copyCaseSource(tx) {
			const root = await tx.getRoot()
			await tx.addChild(root, { tagName: 'Header', attributes: headerAttributes })
			const selectedIed = await tx.addChild(root, { tagName: 'IED', attributes: iedAttributes })
			await tx.addChild(selectedIed, { tagName: 'AccessPoint', attributes: accessPointAttributes })
			return { tagName: 'IED', id: selectedIed.id } as const
		})
		return { projectFile, iedRef }
	}

	const sourceXml = /* xml */ `
		<SCL ${ns} ${id}="source-root">
			<Header id="ProjectSource" fileType="SSD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B" ${id}="source-header"/>
			<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
				<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001"/>
			</IED>
		</SCL>
	`

	describe('extensionless', () => {
		const testCases: SclTest.TestCases<CreatedCase> = {
			'Actual extensionless source with SSD Header -> SCD provenance': {
				sourceXml,
				targetXml: emptyTarget,
				sourceName: 'extensionless',
				sourceExtension: '',
				expectedQueries: [
					'/default:SCL[count(default:Header)=1]/default:Header[@fileType="ISD"]/default:SourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SCD"][@fileName="extensionless"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
					'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SCD"][@fileName="extensionless"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
				],
			},
		}

		async function act({
			project,
			source,
			target,
			testCase,
		}: SclTest.ActParams<CreatedCase>): Promise<SclTest.ActResult> {
			if (!target) throw new Error('target required')
			const { projectFile, iedRef } = await createSourceOfExtension({ project, source, testCase })
			const result = await target.transaction(async function extract(tx) {
				return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: projectFile.query, iedRef })
			})
			expect(result).toEqual({ warnings: [] })
			return { assertOn: 'target' }
		}

		runSclTestCases.withExport({ testCases, act })
	})

	describe('an extension the policy does not know', () => {
		const testCases: SclTest.TestCases<CreatedCase> = {
			'.bogus source with SSD Header -> unsupported source extension without changes': {
				sourceXml,
				targetXml: emptyTarget,
				sourceName: 'unsupported',
				sourceExtension: '.bogus',
				expectedQueries: ['/default:SCL[count(*)=0]'],
			},
		}

		async function act({
			project,
			source,
			target,
			testCase,
		}: SclTest.ActParams<CreatedCase>): Promise<SclTest.ActResult> {
			if (!target) throw new Error('target required')
			const { projectFile, iedRef } = await createSourceOfExtension({ project, source, testCase })
			const outcome = await target.transaction(async function exportIsd(tx) {
				const stagedBefore = [...tx.getStagedOperations()]
				const refused = await tx.lifecycle.extract
					.ied({ ...EXPORT, sourceQuery: projectFile.query, iedRef })
					.then(
						() => undefined,
						(error: unknown) => error,
					)
				return { refused, stagedBefore, stagedAfter: [...tx.getStagedOperations()] }
			})
			const reported = toDialecteError(outcome.refused)
			expect({ key: reported?.key, meta: reported?.meta }).toEqual({
				key: 'OPTION_NOT_AVAILABLE',
				meta: { option: 'sourceExtension', value: '.bogus' },
			})
			expect(outcome.stagedAfter).toEqual(outcome.stagedBefore)
			return { assertOn: 'target' }
		}

		runSclTestCases.withExport({ testCases, act })
	})
})
