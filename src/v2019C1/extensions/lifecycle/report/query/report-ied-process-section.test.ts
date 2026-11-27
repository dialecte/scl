import vendorIcdOf2003 from '../../apply/fixtures/icd-p1-of-the-2003-edition-with-a-process-of-one-lnode.xml?raw'
import vendorIcd from '../../apply/fixtures/icd-p1-of-the-2007-b-4-edition-on-w1-with-its-own-subnetwork-settings.xml?raw'
import vendorIcdWithProcess from '../../apply/fixtures/icd-p1-stating-its-original-edition-with-a-substation-of-two-lnodes.xml?raw'
import projectOnBareW1 from '../../apply/fixtures/project-on-w1-without-settings.xml?raw'
import isdTemplate from '../../integration/ied/fixtures/isd-template-of-a-bay-controller.xml?raw'

import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { ReportWarning } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type WarningCase = SclTest.BaseXmlTestCase & {
	sourceFileName: string
	expected: ReportWarning[]
}

// The report of a first placement from a device file says when the file's process part (a Substation, a Process or a
// Line) is not placed, with the number of LNodes it holds.
describe('query.lifecycle.report - a device file whose process part is not placed', () => {
	const testCases: SclTest.TestCases<WarningCase> = {
		// vendorIcdWithProcess: IED TEMPLATE stating its original edition 2007 A, a Substation TEMPLATE holding two unbound LNodes
		'the vendor ICD with a substation of two LNodes → one warning, ICD, two LNodes': {
			sourceXml: vendorIcdWithProcess,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expected: [{ code: 'process-section-not-placed', fileType: 'ICD', lnodes: 2 }],
		},
		// vendorIcdOf2003: SCL version 2003, a Process TEMPLATE holding one LNode
		'the 2003 vendor ICD with a process of one LNode → one warning, one LNode': {
			sourceXml: vendorIcdOf2003,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expected: [{ code: 'process-section-not-placed', fileType: 'ICD', lnodes: 1 }],
		},
		// isdTemplate: the bay controller's template ISD, its substation section its specification (placed with it)
		'a template ISD with a substation section → no warning': {
			sourceXml: isdTemplate,
			targetXml: projectOnBareW1,
			sourceFileName: 'BCU_Template.isd',
			expected: [],
		},
		// vendorIcd: 2007 B 4, no uuid, Header without one, IED TEMPLATE (ACME P1, no original edition) on W1 with the vendor's bit rate 10, text and private data
		'the vendor ICD with no process part → no warning': {
			sourceXml: vendorIcd,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expected: [],
		},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<WarningCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({
			project,
			xml: testCase.sourceXml,
			fileName: testCase.sourceFileName,
		})
		const ref = await onlyIed({ sourceQuery })
		const anchor = await projectRoot(target.query)
		const report = await target.query.lifecycle.report({ verb: 'ied', sourceQuery, ref, anchor })
		const warnings = (report.warnings ?? []).filter(
			(warning) => warning.code === 'process-section-not-placed',
		)
		expect(warnings).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** A source file imported into the test project, by name, as a read query. */
async function importSource(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	xml: string
	fileName: string
}): Promise<Core.Query<Config>> {
	const { project, xml, fileName } = params
	const imported = await project.importFile(new File([xml], fileName, { type: 'text/xml' }))
	return project.openDocument(imported.documentId).query
}

/** The first IED of a source file. */
async function onlyIed(params: { sourceQuery: Core.Query<Config> }): Promise<Scl.Ref<'IED'>> {
	const [ied] = await params.sourceQuery.getRecordsByTagName('IED')
	if (!ied || !readAttribute({ record: ied, name: 'name' }))
		throw new Error('the source holds no IED')
	return { tagName: 'IED', id: ied.id }
}

/** The root of the project the IED is placed under. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
