import { findRefsPointingTo } from './find-refs-pointing-to'
import refsWithContainersXml from './fixtures/refs-with-containers.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The store reads of the ancestor walks and the records they move, counted by the dev perf counters. */
const MANY_READ = 'core::store::getMany'
const MANY_MOVED = 'core::store::records.getMany'

// The containers of all referrers come from one ancestor walk: one read per level holding an ancestor not read yet,
// each ancestor read once, however many referrers share it.
describe('findRefsPointingTo - the containers read in one walk', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		target: { tagName: string; id: string }
		containerTagName?: Scl.ElementsOf
		expected: { reads: number; moved: number; referrers: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// level 1: 2 LDevices, the Bay, F1, SF1; 2: 2 Servers, the VoltageLevel, F2; 3: 2 AccessPoints, the
		// Substation; 4: 2 IEDs, the SCL; deeper levels hold only ancestors read already
		'XCBR_T, 6 referrers under 2 IEDs and 3 Functions, container IED → 4 reads, 15 records': {
			sourceXml: refsWithContainersXml,
			target: { tagName: 'LNodeType', id: 'lnt-xcbr' },
			containerTagName: 'IED',
			expected: { reads: 4, moved: 15, referrers: 6 },
		},
		// each LN0 climbs its own LDevice, Server, AccessPoint and IED: nothing is shared, nothing more is moved
		'LLN0_T, 2 referrers in 2 IEDs, container IED → 4 reads, 8 records': {
			sourceXml: refsWithContainersXml,
			target: { tagName: 'LNodeType', id: 'lnt-lln0' },
			containerTagName: 'IED',
			expected: { reads: 4, moved: 8, referrers: 2 },
		},
		// XCBR_T types XCBR1 and XCBR2 of I1, XCBR1 of I2 and the three LNodes
		'XCBR_T without a container → no ancestor read': {
			sourceXml: refsWithContainersXml,
			target: { tagName: 'LNodeType', id: 'lnt-xcbr' },
			expected: { reads: 0, moved: 0, referrers: 6 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			source.perf.reset()
			const results = await findRefsPointingTo(source.query, {
				target: testCase.target as Scl.Ref<Scl.ElementsOf>,
				containerTagName: testCase.containerTagName,
			})
			const report = source.perf.report()
			expect({
				reads: report[MANY_READ]?.count ?? 0,
				moved: report[MANY_MOVED]?.count ?? 0,
				referrers: results.length,
			}).toEqual(testCase.expected)
		},
	})
})
