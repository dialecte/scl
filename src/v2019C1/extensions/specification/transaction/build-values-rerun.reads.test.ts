import { sameClassInTargetIed } from '../build/open-value-rules'
import { planIed } from '../query/plan-ied'
import baseBuiltOnS from './fixtures/build-ied/base-built-on-s.xml?raw'
import base from './fixtures/build-ied/base.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test'

/** The query reads of a plan without values, built before or not: no logical node's values are read. */
const READS_WITHOUT_VALUES = 13

/** Contract: a build whose LNodes specify no value reads no value, on a first build and on a re-run alike. */
describe('planIed - no value read when none is specified', () => {
	type TestCase = SclTest.BaseXmlTestCase & { reads: number }

	const testCases: SclTest.TestCases<TestCase> = {
		'Q01 PROT, nothing built yet, no value specified → the reads of a plan': {
			sourceXml: base,
			reads: READS_WITHOUT_VALUES,
		},
		'Q01 PROT already built on S, no value specified → the same reads': {
			sourceXml: baseBuiltOnS,
			reads: READS_WITHOUT_VALUES,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const counting = countQueryReads(source.query)
			const planned = planIed(counting.query, {
				ied: { tagName: 'IED', id: 'ied-s' },
				lnodes: ['lln0', 'ptoc1', 'ptrc1'].map((id) => ({ tagName: 'LNode' as const, id })),
				openValues: { lnType: sameClassInTargetIed },
			})
			await expect(planned.then(() => counting.reads.length)).resolves.toBe(testCase.reads)
		},
	})
})
