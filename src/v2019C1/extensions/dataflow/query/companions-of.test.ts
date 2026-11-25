import unsubscribeBound from '../transaction/fixtures/unsubscribe/unsubscribe-bound.xml?raw'
import { companionsOf } from './companions-of'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/** The ExtRefs implementing the same data object level signal: same logical node, publisher data object and control block. */
describe('companionsOf', () => {
	type TestCase = SclTest.BaseXmlTestCase & { extRef: string; companions: string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'S’s general ExtRef on gcb → its q companion': {
			sourceXml: unsubscribeBound,
			extRef: 'ext-s-general',
			companions: ['ext-s-q'],
		},
		'T’s general ExtRef, alone in its logical node on gcb → none': {
			sourceXml: unsubscribeBound,
			extRef: 'ext-t-general',
			companions: [],
		},
		'S’s report ExtRef, in another logical node and control block → none': {
			sourceXml: unsubscribeBound,
			extRef: 'ext-s-report',
			companions: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const companions = companionsOf(source.query, {
				extRef: { tagName: 'ExtRef', id: testCase.extRef },
			})
			await expect(companions.then((refs) => refs.map((ref) => ref.id))).resolves.toEqual(
				testCase.companions,
			)
		},
	})
})
