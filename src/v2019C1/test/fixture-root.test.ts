import { statesNoSclVersion } from './fixture-root'

import { describe, expect, it } from 'vitest'

const SCL_URI = 'http://www.iec.ch/61850/2003/SCL'

// A fixture states no SCL version when its root element has no `version` of its own (a first-edition file): the root
// is read as XML, not as text, whatever comes before it or however its start tag is written.
describe('statesNoSclVersion - the SCL version a fixture root states', () => {
	const testCases: Record<string, { xml: string; expected: boolean }> = {
		'a root stating its version last → states it': {
			xml: `<SCL xmlns="${SCL_URI}" release="5" revision="C" version="2007"/>`,
			expected: false,
		},
		'a root stating its version in single quotes → states it': {
			xml: `<SCL xmlns='${SCL_URI}' version='2007' revision='C' release='5'/>`,
			expected: false,
		},
		'a comment before the root holding an SCL start tag without version → the root read, states it':
			{
				xml: `<?xml version="1.0"?><!-- <SCL> --><SCL xmlns="${SCL_URI}" version="2007"/>`,
				expected: false,
			},
		'a > inside an attribute value before the version → states it': {
			xml: `<SCL xmlns="${SCL_URI}" xmlns:dev="urn:a>b" version="2007"/>`,
			expected: false,
		},
		'a prefixed root without version → states none': {
			xml: `<scl:SCL xmlns:scl="${SCL_URI}" revision="C"/>`,
			expected: true,
		},
		'a root with only the extension version → states none': {
			xml: `<SCL xmlns="${SCL_URI}" xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100" eIEC61850-6-100:version="2019"/>`,
			expected: true,
		},
		'no SCL root → states nothing to refuse': {
			xml: `<Other xmlns="urn:other"/>`,
			expected: false,
		},
	}
	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(statesNoSclVersion({ xml: testCase.xml })).toBe(testCase.expected)
		})
	}
})
