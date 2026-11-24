import { sameClassInTargetIed } from '../build/open-value-rules'
import { planIed } from '../query/plan-ied'
import rebuildReads3 from './fixtures/rebuild/rebuild-reads-3.xml?raw'
import rebuildReads50 from './fixtures/rebuild/rebuild-reads-50.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test'

/** The query reads of a rebuild with an orphan, the same whatever the number of logical nodes in scope. */
const READS_OF_A_REBUILD = 13

/** Contract: a rebuild costs a fixed number of reads, one lookup per referrer tag whatever the logical nodes in scope. */
describe('planIed - a rebuild in a fixed number of reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & { lnodes: number; reads: number }

	const testCases: SclTest.TestCases<TestCase> = {
		'3 PTOCs bound in PROT, PTRC1 orphaned → the reads of a rebuild': {
			sourceXml: rebuildReads3,
			lnodes: 3,
			reads: READS_OF_A_REBUILD,
		},
		'50 PTOCs bound in PROT, PTRC1 orphaned → the same reads': {
			sourceXml: rebuildReads50,
			lnodes: 50,
			reads: READS_OF_A_REBUILD,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const counting = countQueryReads(source.query)
			const planned = planIed(counting.query, {
				ied: { tagName: 'IED', id: 'ied-s' },
				lnodes: [
					'lln0',
					'cswi1',
					...Array.from({ length: testCase.lnodes }, (_, n) => `ptoc${n + 1}`),
				].map((id) => ({ tagName: 'LNode' as const, id })),
				openValues: { lnType: sameClassInTargetIed },
			})
			await expect(planned.then(() => counting.reads.length)).resolves.toBe(testCase.reads)
		},
	})
})
