import { runSclTestCases } from '../hydrated-test'
import { planCorpusV2 } from './plan-corpus-v2'

import { describe, expect } from 'vitest'

import type { SclTest } from '../hydrated-test.types'
import type { CorpusV2Entry } from './corpus-v2.types'

function entry(params: Partial<CorpusV2Entry> & { path: string }): CorpusV2Entry {
	return {
		headerUuid: params.path,
		version: '0',
		revision: '1',
		sha256: params.path,
		...params,
	}
}

describe('planCorpusV2', () => {
	type TestCase = SclTest.BaseTestCase & {
		entries: CorpusV2Entry[]
		quarantined?: string[]
		/** Per family: the smoke file, the pairs, the duplicates, the pairs of the smoke file's revision. */
		expected: { smoke: string; pairs: string[]; duplicates: string[]; sameRevision?: string[] }[]
	}

	const testCases: Record<string, TestCase> = {
		'a file whose Header uuid no other file has → its own family, in the smoke': {
			entries: [entry({ path: 'a.fsd' })],
			expected: [{ smoke: 'a.fsd', pairs: [], duplicates: [] }],
		},
		'two revisions of one Header uuid → the latest in the smoke, the older a pair': {
			entries: [
				entry({ path: 'XCBRv2r2.fsd', headerUuid: 'x', version: '2', revision: '2' }),
				entry({ path: 'XCBR.fsd', headerUuid: 'x', version: '2', revision: '1' }),
			],
			expected: [{ smoke: 'XCBRv2r2.fsd', pairs: ['XCBR.fsd'], duplicates: [] }],
		},
		'revisions compared as numbers → revision 10 after revision 9': {
			entries: [
				entry({ path: 'r9.asd', headerUuid: 'x', revision: '9' }),
				entry({ path: 'r10.asd', headerUuid: 'x', revision: '10' }),
			],
			expected: [{ smoke: 'r10.asd', pairs: ['r9.asd'], duplicates: [] }],
		},
		'the latest revision quarantined → the latest valid one in the smoke, the others pairs': {
			entries: [
				entry({ path: 'v1r1.asd', headerUuid: 'c', revision: '1' }),
				entry({ path: 'v1r2.asd', headerUuid: 'c', revision: '2' }),
				entry({ path: 'v1r3.xml', headerUuid: 'c', revision: '3' }),
			],
			quarantined: ['v1r3.xml'],
			expected: [{ smoke: 'v1r2.asd', pairs: ['v1r1.asd', 'v1r3.xml'], duplicates: [] }],
		},
		'every revision quarantined → the latest in the smoke': {
			entries: [
				entry({ path: 'v0r1.xml', headerUuid: 't', revision: '1' }),
				entry({ path: 'v0r2.xml', headerUuid: 't', revision: '2' }),
			],
			quarantined: ['v0r1.xml', 'v0r2.xml'],
			expected: [{ smoke: 'v0r2.xml', pairs: ['v0r1.xml'], duplicates: [] }],
		},
		'a byte duplicate → dropped, the own extension and the shorter name kept': {
			entries: [
				entry({ path: 'GAPC_v3_r1 - Copy.xml', headerUuid: 'g', sha256: 'same' }),
				entry({ path: 'GAPC_v3_r1.fsd', headerUuid: 'g', sha256: 'same' }),
			],
			expected: [{ smoke: 'GAPC_v3_r1.fsd', pairs: [], duplicates: ['GAPC_v3_r1 - Copy.xml'] }],
		},
		'a byte duplicate of the same extension → the shorter name kept': {
			entries: [
				entry({ path: 'GAPC copy.fsd', headerUuid: 'g', sha256: 'same' }),
				entry({ path: 'GAPC.fsd', headerUuid: 'g', sha256: 'same' }),
			],
			expected: [{ smoke: 'GAPC.fsd', pairs: [], duplicates: ['GAPC copy.fsd'] }],
		},
		'version before revision → version 2 revision 1 after version 1 revision 9': {
			entries: [
				entry({ path: 'v1r9.fsd', headerUuid: 'x', version: '1', revision: '9' }),
				entry({ path: 'v2r1.fsd', headerUuid: 'x', version: '2', revision: '1' }),
			],
			expected: [{ smoke: 'v2r1.fsd', pairs: ['v1r9.fsd'], duplicates: [] }],
		},
		'two files of one revision with other bytes → the copy order decides, the family lists them': {
			entries: [
				entry({ path: 'v1r2 edited.xml', headerUuid: 'c', revision: '2', sha256: 'edited' }),
				entry({ path: 'v1r2.asd', headerUuid: 'c', revision: '2', sha256: 'saved' }),
			],
			expected: [
				{
					smoke: 'v1r2.asd',
					pairs: ['v1r2 edited.xml'],
					duplicates: [],
					sameRevision: ['v1r2 edited.xml'],
				},
			],
		},
		'one name, two Header uuids → two families': {
			entries: [
				entry({ path: 'baseline/LLN0.fsd', headerUuid: 'b' }),
				entry({ path: 'extended/LLN0.fsd', headerUuid: 'e' }),
			],
			expected: [
				{ smoke: 'baseline/LLN0.fsd', pairs: [], duplicates: [] },
				{ smoke: 'extended/LLN0.fsd', pairs: [], duplicates: [] },
			],
		},
	}

	function act(testCase: TestCase) {
		const quarantined = new Set(testCase.quarantined ?? [])
		const families = planCorpusV2({
			entries: testCase.entries,
			quarantined: (path) => quarantined.has(path),
		})
		expect(
			families.map((family) => ({
				smoke: family.smoke.path,
				pairs: family.pairs.map((pair) => pair.path),
				duplicates: family.duplicates.map((duplicate) => duplicate.path),
				sameRevision: family.sameRevision.map((pair) => pair.path),
			})),
		).toEqual(testCase.expected.map((family) => ({ sameRevision: [], ...family })))
	}

	runSclTestCases.generic(testCases, act)
})
