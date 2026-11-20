import { compareFileIdentity } from './file-identity'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { FileIdentity } from './file-identity.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const FILE_UUID = 'f0000000-0000-4000-8000-000000000002'
const OTHER_FILE_UUID = 'f0000000-0000-4000-8000-000000000009'

/** A file whose Header names it. */
const namedFile = /* xml */ `
	<SCL ${ns} ${id}="open-root">
		<Header id="isd_bcu1" uuid="${FILE_UUID}" version="1" revision="A"/>
	</SCL>
`

/** Another version of that file: the same Header uuid, another revision. */
const sameFileOtherRevision = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" uuid="${FILE_UUID}" version="1" revision="B"/>
	</SCL>
`

/** Another file: another Header uuid. */
const otherFile = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" uuid="${OTHER_FILE_UUID}" version="1" revision="A"/>
	</SCL>
`

/** An open document with no Header either. */
const unnamedFile = /* xml */ `
	<SCL ${ns} ${id}="open-root">
		<!-- no Header -->
	</SCL>
`

/** A document with no Header at all. */
const noHeader = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<!-- no Header -->
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & { expected: FileIdentity }

// Two documents are one file when both Headers name the same file uuid; a Header naming none names no file.
describe('compareFileIdentity - whether two documents are versions of one file', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'both Headers name the same file -> sameFile true, both uuids': {
			sourceXml: sameFileOtherRevision,
			targetXml: namedFile,
			expected: { fileUuid: FILE_UUID, otherFileUuid: FILE_UUID, sameFile: true },
		},
		'the Headers name different files -> sameFile false': {
			sourceXml: otherFile,
			targetXml: namedFile,
			expected: { fileUuid: FILE_UUID, otherFileUuid: OTHER_FILE_UUID, sameFile: false },
		},
		'a document without Header -> sameFile false, its uuid absent': {
			sourceXml: noHeader,
			targetXml: namedFile,
			expected: { fileUuid: FILE_UUID, otherFileUuid: undefined, sameFile: false },
		},
		'neither document has a Header -> sameFile false, both uuids absent': {
			sourceXml: noHeader,
			targetXml: unnamedFile,
			expected: { fileUuid: undefined, otherFileUuid: undefined, sameFile: false },
		},
	}

	async function act({ source, target, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const identity = await compareFileIdentity({ query: target.query, otherQuery: source.query })
		expect(identity).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
