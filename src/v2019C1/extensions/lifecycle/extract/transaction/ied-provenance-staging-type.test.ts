import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The file name the IED's document is imported under. */
	stagingFileName: string
	/** The document the ISD records as its source, imported under this file name. */
	provenance: { xml: string; fileName: string }
}

const EXPORT = {
	iedRef: { tagName: 'IED', id: 'selected-ied' },
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'none',
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'test',
} as const

/** Contract: with a provenance document, only its extension decides the source type; the IED's document is not checked. */
describe('extract IED reads the source type from the provenance document only', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a staging document of an extension the export does not read, an .ssd provenance → recorded, no refusal':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="source-root">
					<Header id="Staging" uuid="10000000-0000-4000-8000-000000000001"/>
					<IED name="R" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
						<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001"/>
					</IED>
				</SCL>
			`,
				stagingFileName: 'staging.isd',
				targetXml: /* xml */ `<SCL ${ns} ${id}="empty-target"/>`,
				provenance: {
					fileName: 'project.ssd',
					xml: /* xml */ `
					<SCL ${ns} ${id}="project-root">
						<Header id="Project" uuid="10000000-0000-4000-8000-000000000009"/>
					</SCL>
				`,
				},
				expectedQueries: [
					'/default:SCL/default:Header[@fileType="ISD"]/default:SourceFiles/default:SclFileReference[@fileType="SSD"][@fileName="project.ssd"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const stagingFile = new File([testCase.sourceXml], testCase.stagingFileName, {
			type: 'text/xml',
		})
		const provenanceFile = new File([testCase.provenance.xml], testCase.provenance.fileName, {
			type: 'text/xml',
		})
		const staging = await project.importFile(stagingFile, { useCustomRecordsIds: true })
		const provenance = await project.importFile(provenanceFile, { useCustomRecordsIds: true })
		const result = await target.transaction(async function extract(tx) {
			return tx.lifecycle.extract.ied({
				...EXPORT,
				sourceQuery: project.openDocument(staging.documentId).query,
				provenanceQuery: project.openDocument(provenance.documentId).query,
			})
		})
		expect(result).toEqual({ warnings: [], fileName: 'ISD_R.isd' })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
