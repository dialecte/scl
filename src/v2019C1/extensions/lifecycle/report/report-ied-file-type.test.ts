import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const iedRef = { tagName: 'IED', id: 'source-ied' } as const satisfies Scl.Ref<'IED'>
const projectRoot = { tagName: 'SCL', id: 'project-root' } as const satisfies Scl.Ref<'SCL'>

/** A file holding the IED SPECIFICATION and nothing else, whatever its extension. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="source-root">
		<IED name="SPECIFICATION" uuid="20000000-0000-4000-8000-000000000001" ${id}="source-ied">
			<AccessPoint name="AP1"/>
		</IED>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project-root">
		<!-- no IED -->
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	sourceFileName: string
	expected: { fileType: SclFileType } | { refused: { key: string; meta: Record<string, unknown> } }
}

// The type of file an IED is placed from, read from the source document's extension and written on the report's
// target: an ISD, an ICD, an IID, or an SCD for `.scd` and `.xml`. Another extension is refused. Only the IED of a
// template ISD or of an ICD is placed: an IID, an SCD and an ISD instance file are refused.
describe('query.lifecycle.report - the type of file an IED is placed from', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'.isd source → ISD': {
			sourceXml,
			targetXml: projectXml,
			sourceFileName: 'P1.isd',
			expected: { fileType: 'ISD' },
		},
		'.isd source whose IED is not named SPECIFICATION → refused, an ISD instance file is not placed yet':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="source-root">
					<IED name="BCU1" uuid="20000000-0000-4000-8000-000000000001" ${id}="source-ied">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
				targetXml: projectXml,
				sourceFileName: 'BCU1.isd',
				expected: {
					refused: {
						key: 'OPTION_NOT_AVAILABLE',
						meta: { option: 'source', value: 'isd-instance' },
					},
				},
			},
		'.icd source → ICD': {
			sourceXml,
			targetXml: projectXml,
			sourceFileName: 'P1.icd',
			expected: { fileType: 'ICD' },
		},
		'.iid source → IID, refused: an IID keeps its identity, not placed yet': {
			sourceXml,
			targetXml: projectXml,
			sourceFileName: 'P1.iid',
			expected: {
				refused: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'source', value: 'iid' } },
			},
		},
		'.xml source → SCD, refused: an SCD keeps its identity, not placed yet': {
			sourceXml,
			targetXml: projectXml,
			sourceFileName: 'P1.xml',
			expected: {
				refused: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'source', value: 'scd' } },
			},
		},
		'.scd source → SCD, refused: an SCD keeps its identity, not placed yet': {
			sourceXml,
			targetXml: projectXml,
			sourceFileName: 'P1.scd',
			expected: {
				refused: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'source', value: 'scd' } },
			},
		},
		'.ssd source → refused, no IED is placed from a specification of the substation': {
			sourceXml,
			targetXml: projectXml,
			sourceFileName: 'P1.ssd',
			expected: {
				refused: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'sourceExtension', value: '.ssd' },
				},
			},
		},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], testCase.sourceFileName, { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const sourceFile = project.openDocument(imported.documentId)
		const outcome = await target.query.lifecycle
			.report({ verb: 'ied', sourceQuery: sourceFile.query, ref: iedRef, anchor: projectRoot })
			.then(
				(reported) => ({ fileType: reported.target?.fileType }),
				(error: unknown) => {
					const refusal = toDialecteError(error)
					return { refused: { key: refusal?.key, meta: refusal?.meta } }
				},
			)
		expect(outcome).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// An import refuses a file without an extension: the source is a document created without one in the act, holding
// an IED P1; the runner's own source document is left empty.
describe('query.lifecycle.report - an IED placed from a source without an extension', () => {
	type CreatedCase = SclTest.BaseXmlTestCase & {
		expected: { refused: { key: string; meta: Record<string, unknown> } }
	}

	const testCases: SclTest.TestCases<CreatedCase> = {
		'no extension → SCD, refused: an SCD keeps its identity, not placed yet': {
			sourceXml: /* xml */ `<SCL ${ns} ${id}="unused-runner-source"/>`,
			targetXml: projectXml,
			expected: {
				refused: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'source', value: 'scd' } },
			},
		},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<CreatedCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const documentId = await project.initEmptyDocument({ name: 'P1', extension: '' })
		const sourceFile = project.openDocument(documentId)
		const createdIed = await sourceFile.transaction(async function holdIed(tx) {
			const root = await tx.getRoot()
			const ied = await tx.addChild(root, {
				tagName: 'IED',
				attributes: { name: 'P1', uuid: '20000000-0000-4000-8000-000000000001' },
			})
			await tx.addChild(ied, { tagName: 'AccessPoint', attributes: { name: 'AP1' } })
			return { tagName: 'IED', id: ied.id } as const
		})
		const outcome = await target.query.lifecycle
			.report({ verb: 'ied', sourceQuery: sourceFile.query, ref: createdIed, anchor: projectRoot })
			.then(
				(reported) => ({ fileType: reported.target?.fileType }),
				(error: unknown) => {
					const refusal = toDialecteError(error)
					return { refused: { key: refusal?.key, meta: refusal?.meta } }
				},
			)
		expect(outcome).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
