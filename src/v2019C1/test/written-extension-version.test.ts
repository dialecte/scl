/// <reference types="vite/client" />

import WithoutExtensionContentXml from './fixtures/written-extension-version/a-bay-without-extension-content.xml?raw'
import ExtensionVersionMissingXml from './fixtures/written-extension-version/an-lnode-named-by-the-extension-its-root-without-the-extension-version.xml?raw'
import ExtensionVersionStatedXml from './fixtures/written-extension-version/an-lnode-named-by-the-extension.xml?raw'
import { createSclTestProject } from './hydrated-test'

import { describe, expect, it } from 'vitest'

type WrittenCase = {
	sourceXml: string
	noExtensionVersion?: string
	/** The eIEC61850-6-100 attributes the written root states, as written, in the order written. */
	expected: string[]
}

const EXTENSION_VERSION = [
	'eIEC61850-6-100:release="1"',
	'eIEC61850-6-100:revision="C"',
	'eIEC61850-6-100:version="2019"',
]

// A written document holding content of the eIEC61850-6-100 extension states the extension's version on its root, once,
// whether its root stated it or not; a document holding none states none.
describe('the eIEC61850-6-100 version a written document states', () => {
	const testCases: Record<string, WrittenCase> = {
		'6-100 content, the root stating no extension version → the written root states it once': {
			// an LNode named by an eIEC61850-6-100 LNodeSpecNaming, its root declaring the namespace without the version
			sourceXml: ExtensionVersionMissingXml,
			noExtensionVersion: 'the root lacks the extension version the write is to state',
			expected: EXTENSION_VERSION,
		},
		'6-100 content, the root stating the extension version → the written root states it once': {
			// the same LNode, its root stating the eIEC61850-6-100 version
			sourceXml: ExtensionVersionStatedXml,
			expected: EXTENSION_VERSION,
		},
		'no 6-100 content → the written root states no extension version': {
			// a bay alone: no eIEC61850-6-100 element or attribute, the namespace not declared
			sourceXml: WithoutExtensionContentXml,
			expected: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, async () => {
			const { project, source } = await createSclTestProject({
				sourceXml: testCase.sourceXml,
				noExtensionVersion: testCase.noExtensionVersion,
			})
			const { file } = await project.export({
				documentId: source.document.documentId,
				indent: false,
			})
			const written = await file.text()
			const root = /<SCL\b[^>]*>/.exec(written)?.[0] ?? ''
			const stated = [...root.matchAll(/eIEC61850-6-100:\w+="[^"]*"/g)].map(
				([attribute]) => attribute,
			)
			expect(stated).toEqual(testCase.expected)
		})
	}
})
