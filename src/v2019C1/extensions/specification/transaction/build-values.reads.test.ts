import { sameClassInTargetIed } from '../build/open-value-rules'
import { planIed } from '../query/plan-ied'
import valuesReads2 from './fixtures/build-values/values-reads-2.xml?raw'
import valuesReads50 from './fixtures/build-values/values-reads-50.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test'

/** The query reads of one plan with values, the same whatever the number of logical nodes and values. */
const READS_OF_A_PLAN_WITH_VALUES = 19

/** Contract: the values of a build cost a fixed number of reads, whatever the number of logical nodes and values. */
describe('planIed - the values in a fixed number of reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & { lnodes: number; reads: number }

	const testCases: SclTest.TestCases<TestCase> = {
		'2 PTOC LNodes of 6 values each → the reads of a plan with values': {
			sourceXml: valuesReads2,
			lnodes: 2,
			reads: READS_OF_A_PLAN_WITH_VALUES,
		},
		'50 PTOC LNodes of 6 values each (300 DAS) → the same reads': {
			sourceXml: valuesReads50,
			lnodes: 50,
			reads: READS_OF_A_PLAN_WITH_VALUES,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const counting = countQueryReads(source.query)
			const planned = planIed(counting.query, {
				ied: { tagName: 'IED', id: 'ied-s' },
				lnodes: Array.from({ length: testCase.lnodes }, (_, n) => ({
					tagName: 'LNode' as const,
					id: `ptoc${n + 1}`,
				})),
				openValues: { lnType: sameClassInTargetIed },
			})
			await expect(planned.then(() => counting.reads.length)).resolves.toBe(testCase.reads)
		},
	})
})
