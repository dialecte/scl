import { readSclEdition } from './source-file-edition'

import { describe, expect, it } from 'vitest'

import { CURRENT_SCL_EDITION, XMLNS_SCL_NAMESPACE, createSclTestProject } from '@/v2019C1/test'

import type { SclEdition } from './source-file-edition.types'

type EditionCase = {
	sourceXml: string
	editionOneRoot?: string
	expected: SclEdition
}

// The edition a document's root states: a root stating no version is a first-edition file (2003, no revision, no
// release); a root stating its version keeps its revision and release as written.
describe('readSclEdition - the edition an imported document states', () => {
	const testCases: Record<string, EditionCase> = {
		'a root stating no version → 2003, no revision, no release': {
			sourceXml: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE}><Header id="h"/></SCL>`,
			editionOneRoot: 'a first-edition file: its root states no version',
			expected: { version: '2003' },
		},
		'a root stating 2007 B 4 → 2007 B 4': {
			sourceXml: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} version="2007" revision="B" release="4"><Header id="h"/></SCL>`,
			expected: { version: '2007', revision: 'B', release: '4' },
		},
		'a root stating the current edition → 2007 C 5': {
			sourceXml: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${CURRENT_SCL_EDITION}><Header id="h"/></SCL>`,
			expected: { version: '2007', revision: 'C', release: '5' },
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, async () => {
			const { source } = await createSclTestProject({
				sourceXml: testCase.sourceXml,
				editionOneRoot: testCase.editionOneRoot,
			})
			const root = await source.document.query.getRoot()
			expect(readSclEdition(root)).toEqual(testCase.expected)
		})
	}
})

// A document created in the tool states the edition the schema fixes on its root: it reads as the current edition.
describe('readSclEdition - the edition of a created document', () => {
	it('a document created empty → 2007 C 5', async () => {
		const { project } = await createSclTestProject({
			sourceXml: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${CURRENT_SCL_EDITION}><Header id="h"/></SCL>`,
		})
		const documentId = await project.initEmptyDocument({ name: 'created', extension: '' })
		const root = await project.openDocument(documentId).query.getRoot()
		expect(readSclEdition(root)).toEqual({ version: '2007', revision: 'C', release: '5' })
	})
})
