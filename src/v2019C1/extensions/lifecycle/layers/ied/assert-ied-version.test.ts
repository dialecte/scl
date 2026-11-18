import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const FILE_UUID = 'f0000000-0000-4000-8000-000000000002'
const OTHER_FILE_UUID = 'f0000000-0000-4000-8000-000000000009'
const IED_UUID = 'b0000000-0000-4000-8000-000000000030'
const OTHER_IED_UUID = 'b0000000-0000-4000-8000-000000000090'

const otherIedRef = { tagName: 'IED', id: 'other-ied' } as const satisfies Scl.Ref<'IED'>
const openRoot = { tagName: 'SCL', id: 'open-root' } as const satisfies Scl.Ref<'SCL'>

/** The open ISD instance file of BCU1: its Header names the file, its IED carries BCU1's uuid. */
const openIsd = /* xml */ `
	<SCL ${ns} ${id}="open-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="${FILE_UUID}" version="1" revision="A"/>
		<IED name="BCU1" uuid="${IED_UUID}">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000031"/>
		</IED>
	</SCL>
`

/** Another file: another Header uuid, and an IED BCU1 of another uuid (a copy). */
const anotherFile = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="${OTHER_FILE_UUID}" version="1" revision="B"/>
		<IED name="BCU1" uuid="${OTHER_IED_UUID}" ${id}="other-ied">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000091"/>
		</IED>
	</SCL>
`

/** The same file (the open ISD's Header uuid) holding an IED BCU1 of another uuid. */
const sameFileAnotherIed = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="${FILE_UUID}" version="1" revision="B"/>
		<IED name="BCU1" uuid="${OTHER_IED_UUID}" ${id}="other-ied">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000091"/>
		</IED>
	</SCL>
`

/** Another version of BCU1 (the same IED uuid) whose Header names no file. */
const otherWithoutFileUuid = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" fileType="ISD" version="1" revision="B"/>
		<IED name="BCU1" uuid="${IED_UUID}" ${id}="other-ied">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000031"/>
		</IED>
	</SCL>
`

/** A re-extraction of BCU1: a new Header uuid, the same IED uuid. */
const reExtraction = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="${OTHER_FILE_UUID}" version="1" revision="A"/>
		<IED name="BCU1" uuid="${IED_UUID}" ${id}="other-ied">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000031"/>
		</IED>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	expected: { refused: { key: string; meta: Record<string, unknown> } }
}

// A fork on an open ISD document takes over another version of that file only: the Header uuid names the file across
// its versions, and the IED keeps its uuid. Another file (a file imported without a Header uuid is given a fresh one,
// so it is another file) or the same file with another IED is refused before anything is read further, the reason in
// the meta.
describe('query.lifecycle.report - a fork on an open ISD refuses a file that is not a version of it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'another file (another Header uuid) -> NOT_A_VERSION_OF_FILE, reason other-file, both uuids in meta':
			{
				sourceXml: anotherFile,
				targetXml: openIsd,
				expected: {
					refused: {
						key: 'NOT_A_VERSION_OF_FILE',
						meta: { reason: 'other-file', fileUuid: FILE_UUID, otherFileUuid: OTHER_FILE_UUID },
					},
				},
			},
		'the same Header uuid, the open IED of another uuid -> refused, reason other-ied': {
			sourceXml: sameFileAnotherIed,
			targetXml: openIsd,
			expected: {
				refused: {
					key: 'NOT_A_VERSION_OF_FILE',
					meta: { reason: 'other-ied', iedUuid: IED_UUID, otherIedUuid: OTHER_IED_UUID },
				},
			},
		},
		'the other version without a Header uuid -> refused, reason other-file, the uuid its import gave in meta':
			{
				sourceXml: otherWithoutFileUuid,
				targetXml: openIsd,
				expected: {
					refused: {
						key: 'NOT_A_VERSION_OF_FILE',
						meta: { reason: 'other-file', fileUuid: FILE_UUID, otherFileUuid: expect.any(String) },
					},
				},
			},
		'a re-extraction of the same IED (new Header uuid, same IED uuid) -> refused, reason other-file':
			{
				sourceXml: reExtraction,
				targetXml: openIsd,
				expected: {
					refused: {
						key: 'NOT_A_VERSION_OF_FILE',
						meta: { reason: 'other-file', fileUuid: FILE_UUID, otherFileUuid: OTHER_FILE_UUID },
					},
				},
			},
	}

	async function act({ project, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		const open = await importIsd({ project, xml: testCase.targetXml, fileName: 'BCU1.isd' })
		const other = await importIsd({ project, xml: testCase.sourceXml, fileName: 'BCU1-other.isd' })
		const outcome = await open.query.lifecycle
			.report({
				verb: 'ied',
				scenario: 'fork',
				sourceQuery: other.query,
				ref: otherIedRef,
				anchor: openRoot,
			})
			.then(
				() => ({ reported: true }),
				(error: unknown) => {
					const refusal = toDialecteError(error)
					return { refused: { key: refusal?.key, meta: refusal?.meta } }
				},
			)
		expect(outcome).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** Import an ISD file of the case into the project, under its own extension, and open it. */
async function importIsd(params: {
	project: SclTest.ActParams<TestCase>['project']
	xml: string | undefined
	fileName: string
}) {
	const { project, xml, fileName } = params
	if (!xml) throw new Error(`${fileName}: xml required`)
	const { documentId } = await project.importFile(new File([xml], fileName, { type: 'text/xml' }), {
		useCustomRecordsIds: true,
	})
	return project.openDocument(documentId)
}
