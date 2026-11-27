import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { IidExtractParams } from './ied.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The document the IID records as its source, imported under this file name. */
	provenance: { xml: string; fileName: string }
}

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

/** The document the IED is read from: a staging document, never recorded; its IED came from a vendor ICD and holds no owner. */
const stagingXml = /* xml */ `
	<SCL ${ns} ${id}="source-root">
		<Header id="Staging" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="0" revision="1"/>
		<IED name="R" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
			<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001"/>
			<IEDSourceFiles>
				<SclFileReference fileType="ICD" fileName="vendor" fileUuid="10000000-0000-4000-8000-000000000003" version="1" revision="0"/>
			</IEDSourceFiles>
		</IED>
	</SCL>
`

const IID = {
	iedRef: { tagName: 'IED', id: 'selected-ied' },
	fileType: 'IID',
	tool: 'TEST',
	who: 'test',
} as const satisfies Omit<IidExtractParams, 'sourceQuery'>

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

describe('extract IED as IID - the project the IED goes back to is the document recorded as its source', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'IED read from a staging document, the project as provenance, the IED holding no owner -> owner written as the project Header id':
			{
				sourceXml: stagingXml,
				targetXml: emptyTarget,
				provenance: {
					fileName: 'project.scd',
					xml: /* xml */ `
						<SCL ${ns} ${id}="project-root">
							<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000009" version="3" revision="C"/>
						</SCL>
					`,
				},
				expectedQueries: [
					'/default:SCL/default:IED[@name="R"][@owner="ProjectSource"]',
					'/default:SCL/default:Header[@fileType="IID"]/default:SourceFiles/default:SclFileReference[@fileUuid="10000000-0000-4000-8000-000000000009"]',
				],
				unexpectedQueries: ['//default:IED[@owner="Staging"]'],
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
				...IID,
				sourceQuery: source.query,
				provenanceQuery: provenance.query,
			})
		})
		expect(result).toMatchObject({ fileName: 'R.iid' })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
