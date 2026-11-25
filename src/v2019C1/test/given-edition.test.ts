import { createSclTestProject } from './hydrated-test'
import {
	ALL_XMLNS_NAMESPACES,
	XMLNS_SCL_6_100_NAMESPACE,
	XMLNS_SCL_NAMESPACE,
} from './scl-xmlns.constants'

import { describe, expect, it } from 'vitest'

/** A root declaring the namespaces only: no version, as a first-edition file's root. */
const FIRST_EDITION_ROOT = `${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE}`

type EditionCase = {
	sourceXml: string
	editionOneRoot?: string
	/** The message the call rejects with, absent when the project opens. */
	expected: ReturnType<typeof expect.stringContaining> | undefined
}

// A given document states the SCL edition of its root, as every file of the current edition does: a root stating no
// version is a first-edition file, refused unless the test says it is one on purpose (`editionOneRoot`, with the
// reason). An opt-in on a root stating its version, or without a reason, is refused too.
describe('createSclTestProject - the edition a given document states', () => {
	const testCases: Record<string, EditionCase> = {
		'a root stating version 2007 revision C release 5 → opens': {
			sourceXml: /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Header id="h"/></SCL>`,
			expected: undefined,
		},
		'a root stating no version → refused, naming the source document': {
			sourceXml: /* xml */ `<SCL ${FIRST_EDITION_ROOT}><Header id="h"/></SCL>`,
			expected: expect.stringContaining('the source document states no SCL version'),
		},
		'a root stating no version, editionOneRoot given → opens': {
			sourceXml: /* xml */ `<SCL ${FIRST_EDITION_ROOT}><Header id="h"/></SCL>`,
			editionOneRoot: 'a first-edition device file',
			expected: undefined,
		},
		'a root stating its version, editionOneRoot given → refused, the opt-in stale': {
			sourceXml: /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Header id="h"/></SCL>`,
			editionOneRoot: 'a first-edition device file',
			expected: expect.stringContaining(
				'editionOneRoot is given but every given document states its SCL version',
			),
		},
		'a root stating no version, editionOneRoot empty → refused, no reason': {
			sourceXml: /* xml */ `<SCL ${FIRST_EDITION_ROOT}><Header id="h"/></SCL>`,
			editionOneRoot: '',
			expected: expect.stringContaining('editionOneRoot needs the reason'),
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, async () => {
			const opened = createSclTestProject({
				sourceXml: testCase.sourceXml,
				editionOneRoot: testCase.editionOneRoot,
			}).then(
				() => undefined,
				(error: unknown) => (error instanceof Error ? error.message : String(error)),
			)
			const message = await opened
			expect(message).toEqual(testCase.expected)
		})
	}
})
