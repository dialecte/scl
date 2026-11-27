import unsubscribeReads2 from './fixtures/unsubscribe/unsubscribe-reads-2.xml?raw'
import unsubscribeReads50 from './fixtures/unsubscribe/unsubscribe-reads-50.xml?raw'
import { unsubscribe } from './unsubscribe'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test'

/** The store reads of one unsubscribe, the same whatever the number of control blocks and ExtRefs. */
const READS_OF_AN_UNSUBSCRIBE = 7

/** Contract: ending one subscription costs a fixed number of reads, whatever the control blocks and ExtRefs. */
describe('unsubscribe - a fixed number of reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & { reads: number }

	const testCases: SclTest.TestCases<TestCase> = {
		// Two control blocks; the companion run ends the given ExtRef on the first.
		'2 control blocks of 1 ExtRef, one ended → the reads of an unsubscribe': {
			sourceXml: unsubscribeReads2,
			reads: READS_OF_AN_UNSUBSCRIBE,
		},
		// Fifty ExtRefs and an LN-precision registration keep companion and registration reads batched.
		'10 control blocks of 5 ExtRefs, one ended → the same reads': {
			sourceXml: unsubscribeReads50,
			reads: READS_OF_AN_UNSUBSCRIBE,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const reads = source.transaction(async function countReads(tx) {
				const counting = countDocumentQueryReads(tx)
				await unsubscribe(counting.query, {
					extRefs: [{ tagName: 'ExtRef', id: 'ext-0-0' }],
				})
				return counting.calls().filter((call) => call.method.startsWith('get')).length
			})
			await expect(reads).resolves.toBe(testCase.reads)
		},
	})
})
