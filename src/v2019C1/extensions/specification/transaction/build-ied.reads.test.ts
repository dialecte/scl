import { sameClassInTargetIed } from '../build/open-value-rules'
import { planIed } from '../query/plan-ied'
import reads2x2 from './fixtures/build-ied/reads-2x2.xml?raw'
import reads50x10 from './fixtures/build-ied/reads-50x10.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test'

/** The query reads of one plan, the same whatever the number of functions and LNodes. */
const READS_OF_A_PLAN = 13

/** Contract: planning a build costs a fixed number of query reads, whatever the number of functions and LNodes. */
describe('planIed - a fixed number of reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & { lnodes: string[]; reads: number }

	const testCases: SclTest.TestCases<TestCase> = {
		'2 functions of 2 LNodes → the reads of a plan': {
			sourceXml: reads2x2,
			lnodes: ['fn-0-ptoc1', 'fn-0-ptoc2', 'fn-1-ptoc1', 'fn-1-ptoc2'],
			reads: READS_OF_A_PLAN,
		},
		'50 functions of 10 LNodes → the same reads': {
			sourceXml: reads50x10,
			lnodes: Array.from({ length: 50 }, (_, f) =>
				Array.from({ length: 10 }, (_, n) => `fn-${f}-ptoc${n + 1}`),
			).flat(),
			reads: READS_OF_A_PLAN,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const counting = countQueryReads(source.query)
			const planned = planIed(counting.query, {
				ied: { tagName: 'IED', id: 'ied-s' },
				lnodes: testCase.lnodes.map((id) => ({ tagName: 'LNode', id })),
				openValues: { lnType: sameClassInTargetIed },
			})
			await expect(planned.then(() => counting.reads.length)).resolves.toBe(testCase.reads)
		},
	})
})
