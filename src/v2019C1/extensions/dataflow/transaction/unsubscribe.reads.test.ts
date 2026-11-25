import unsubscribeReads2 from './fixtures/unsubscribe/unsubscribe-reads-2.xml?raw'
import unsubscribeReads50 from './fixtures/unsubscribe/unsubscribe-reads-50.xml?raw'
import { unsubscribe } from './unsubscribe'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test'

/** The store reads of one unsubscribe, the same whatever the number of control blocks and ExtRefs. */
const READS_OF_AN_UNSUBSCRIBE = 7

/** What a transaction does that is a write, not a read. */
const WRITES: ReadonlySet<string> = new Set(['update', 'delete', 'addChild', 'ensureChild', 'move'])

/** Contract: ending one subscription costs a fixed number of reads, whatever the control blocks and ExtRefs. */
describe('unsubscribe - a fixed number of reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & { reads: number }

	const testCases: SclTest.TestCases<TestCase> = {
		'2 control blocks of 1 ExtRef, one ended → the reads of an unsubscribe': {
			sourceXml: unsubscribeReads2,
			reads: READS_OF_AN_UNSUBSCRIBE,
		},
		'10 control blocks of 5 ExtRefs, one ended → the same reads': {
			sourceXml: unsubscribeReads50,
			reads: READS_OF_AN_UNSUBSCRIBE,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const reads = source.transaction(async function countReads(tx) {
				const counting = countQueryReads(tx)
				await unsubscribe(counting.query, {
					extRefs: [{ tagName: 'ExtRef', id: 'ext-0-0' }],
					withCompanions: false,
				})
				return counting.reads.filter((name) => !WRITES.has(name)).length
			})
			await expect(reads).resolves.toBe(testCase.reads)
		},
	})
})
