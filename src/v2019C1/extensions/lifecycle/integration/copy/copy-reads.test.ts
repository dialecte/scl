import { ref } from './copy-helpers'
import functionXml from './fixtures/a-function-to-copy.xml?raw'

import { describe, expect } from 'vitest'

import { listCopyRefusals, planCopyUnbinds } from '@/v2019C1/extensions/lifecycle/copy'
import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// a-function-to-copy.xml: F2 holds one LNode; F1 holds three, two bound, a behaviour, inputs and a breaker.

/** The reads of one element or one subtree, and the batched reads of records by ref, each counted. */
const PER_ELEMENT_READS = [
	'findAncestors',
	'findDescendants',
	'getRecord',
	'getRecords',
	'getTree',
] as const

// What a copy lists of its unbinds and refusals reads the trees it is given, never an element of them again: the reads
// do not grow with what it copies.
describe('the reads of the unbinds and refusals of a copy', () => {
	type ReadsCase = SclTest.BaseXmlTestCase & {
		small: Scl.Ref<'Function'>
		large: Scl.Ref<'Function'>
		anchor: Scl.Ref<'Bay'>
	}

	const testCases: SclTest.TestCases<ReadsCase> = {
		// F2 holds one LNode; F1 three, two bound, a behaviour, inputs and a breaker
		'F2 and F1 copied to B3 → the same per-element reads, none of the trees read again': {
			sourceXml: functionXml,
			small: ref('Function', 'f2'),
			large: ref('Function', 'f1'),
			anchor: ref('Bay', 'b3'),
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReadsCase>): Promise<void> {
		async function countedFor(root: Scl.Ref<'Function'>): Promise<Record<string, number>> {
			const tree = await source.query.any.getTree(root)
			const trees = tree ? [tree] : []
			const reads = countDocumentQueryReads(source.query)
			const unbinds = planCopyUnbinds({ trees })
			await listCopyRefusals({ query: reads.query, trees, unbinds, anchor: testCase.anchor })
			const calls = reads.calls()
			return Object.fromEntries(
				PER_ELEMENT_READS.map((method) => [
					method,
					calls.filter((call) => call.method === method).length,
				]),
			)
		}
		const counted = countedFor(testCase.small).then(async function thenLarge(small) {
			return { small, large: await countedFor(testCase.large) }
		})
		// no tree read again: the trees are given
		await expect(counted).resolves.toMatchObject({ large: { getTree: 0 } })
		// one read per element of the larger copy would make its counts differ from the smaller one's
		const { small, large } = await counted
		expect(large).toEqual(small)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
