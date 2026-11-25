import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The document the ISD records as its source, imported under this file name. */
	provenance: { xml: string; fileName: string }
}

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

/** The document the IED is read from: a staging document, never recorded. */
const stagingXml = /* xml */ `
	<SCL ${ns} ${id}="source-root">
		<Header id="Staging" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="0" revision="1"/>
		<IED name="R" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
			<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001"/>
		</IED>
	</SCL>
`

const EXPORT = {
	iedRef: { tagName: 'IED', id: 'selected-ied' },
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'none',
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'test',
} as const

async function importProvenance(params: {
	project: SclTest.ActParams<TestCase>['project']
	testCase: TestCase
}) {
	const { project, testCase } = params
	const imported = await project.importFile(
		new File([testCase.provenance.xml], testCase.provenance.fileName, { type: 'text/xml' }),
		{ useCustomRecordsIds: true },
	)
	return project.openDocument(imported.documentId)
}

describe('extract IED records the document provenanceQuery names as its source', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'an .ssd project as provenance, the IED read from a staging document → the project recorded as SSD at the Header and on the IED':
			{
				sourceXml: stagingXml,
				targetXml: emptyTarget,
				provenance: {
					fileName: 'project.ssd',
					xml: /* xml */ `
						<SCL ${ns} ${id}="project-root">
							<Header id="Project" fileType="SCD" uuid="10000000-0000-4000-8000-000000000009" version="3" revision="C"/>
						</SCL>
					`,
				},
				expectedQueries: [
					'/default:SCL/default:Header[@fileType="ISD"]/default:SourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SSD"][@fileName="project.ssd"][@fileUuid="10000000-0000-4000-8000-000000000009"][@version="3"][@revision="C"]',
					'/default:SCL/default:IED[@name="R"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SSD"][@fileName="project.ssd"][@fileUuid="10000000-0000-4000-8000-000000000009"]',
				],
				unexpectedQueries: [
					'//default:SclFileReference[@fileUuid="10000000-0000-4000-8000-000000000001"]',
				],
			},
	}

	async function act({
		project,
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const provenance = await importProvenance({ project, testCase })
		const result = await target.transaction(async function extract(tx) {
			return tx.lifecycle.extract.ied({
				...EXPORT,
				sourceQuery: source.query,
				provenanceQuery: provenance.query,
			})
		})
		expect(result).toEqual({ warnings: [], fileName: 'ISD_R.isd' })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extract IED refuses a provenance document of an unknown type', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a provenance document of an extension the export does not know → OPTION_NOT_AVAILABLE without changes':
			{
				sourceXml: stagingXml,
				targetXml: emptyTarget,
				provenance: {
					fileName: 'project.icd',
					xml: /* xml */ `
					<SCL ${ns} ${id}="project-root">
						<Header id="Project" uuid="10000000-0000-4000-8000-000000000009"/>
					</SCL>
				`,
				},
				expectedQueries: ['/default:SCL[count(*)=0]'],
			},
	}

	async function act({
		project,
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const provenance = await importProvenance({ project, testCase })
		const refused = await target.transaction(async function exportIsd(tx) {
			return tx.lifecycle.extract
				.ied({ ...EXPORT, sourceQuery: source.query, provenanceQuery: provenance.query })
				.then(
					() => undefined,
					(error: unknown) => error,
				)
		})
		const reported = toDialecteError(refused)
		expect({ key: reported?.key, meta: reported?.meta }).toEqual({
			key: 'OPTION_NOT_AVAILABLE',
			meta: { option: 'sourceExtension', value: '.icd' },
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
