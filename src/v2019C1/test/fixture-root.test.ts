import { missingSclEdition, readFixtureRoot } from './fixture-root'

import { describe, expect, it } from 'vitest'

const SCL_URI = 'http://www.iec.ch/61850/2003/SCL'
const EDITION = 'version="2007" revision="C" release="5"'

// What a fixture's root lacks of the SCL edition (version, revision, release) as attributes of its own: a root lacking
// the version is a first-edition file. The root is read as XML, not as text, whatever comes before it or however its
// start tag is written.
describe('missingSclEdition - the SCL edition a fixture root lacks', () => {
	const testCases: Record<string, { xml: string; expected: readonly string[] | undefined }> = {
		'a root stating the edition, attributes reordered → lacks nothing': {
			xml: `<SCL xmlns="${SCL_URI}" release="5" revision="C" version="2007"/>`,
			expected: [],
		},
		'a root stating the edition in single quotes → lacks nothing': {
			xml: `<SCL xmlns='${SCL_URI}' version='2007' revision='C' release='5'/>`,
			expected: [],
		},
		'a comment before the root holding an SCL start tag without the edition → the root read, lacks nothing':
			{
				xml: `<?xml version="1.0"?><!-- <SCL> --><SCL xmlns="${SCL_URI}" ${EDITION}/>`,
				expected: [],
			},
		'a > inside an attribute value before the edition → lacks nothing': {
			xml: `<SCL xmlns="${SCL_URI}" xmlns:dev="urn:a>b" ${EDITION}/>`,
			expected: [],
		},
		'a prefixed root without version → lacks the version': {
			xml: `<scl:SCL xmlns:scl="${SCL_URI}" revision="C" release="5"/>`,
			expected: ['version'],
		},
		'a root with only the extension version → lacks the whole edition': {
			xml: `<SCL xmlns="${SCL_URI}" xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100" eIEC61850-6-100:version="2019"/>`,
			expected: ['version', 'revision', 'release'],
		},
		'a root stating version and revision → lacks the release': {
			xml: `<SCL xmlns="${SCL_URI}" version="2007" revision="C"/>`,
			expected: ['release'],
		},
		'a root writing its version empty → lacks the version': {
			xml: `<SCL xmlns="${SCL_URI}" version="" revision="C" release="5"/>`,
			expected: ['version'],
		},
		'no SCL root → nothing to say': {
			xml: `<Other xmlns="urn:other"/>`,
			expected: undefined,
		},
	}
	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(missingSclEdition({ xml: testCase.xml })).toEqual(testCase.expected)
		})
	}
})

// A text that is not well-formed up to the end of the root's start tag is refused with the parser's error, never read
// as a root.
describe('readFixtureRoot - a root not well-formed', () => {
	const testCases: Record<string, { xml: string }> = {
		'an unquoted attribute value → throws': { xml: `<SCL xmlns="${SCL_URI}" version=2007/>` },
		'an attribute prefix bound to no namespace → throws': {
			xml: `<SCL xmlns="${SCL_URI}" x:version="2007"/>`,
		},
		'a start tag left open → throws': { xml: `<SCL xmlns="${SCL_URI}" version="2007"` },
		'text before the root → throws': { xml: `junk<SCL xmlns="${SCL_URI}" ${EDITION}/>` },
	}
	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(() => readFixtureRoot({ xml: testCase.xml })).toThrow()
		})
	}
})
