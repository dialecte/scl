import { beforeCommit } from './before-commit'
import twoVoltageLevels from './fixtures/two-voltage-levels-with-functions-and-nodes.xml?raw'

import { describe, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/** The reads of one element or one subtree, each counted. */
const PER_ELEMENT_READS = ['findAncestors', 'findDescendants', 'getRecord', 'getTree'] as const

describe('the reads of a commit creating an element the extension wraps', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		parent: Scl.Ref<Scl.ElementsOf>
		/** The times each per-element read is called. */
		expected: Record<(typeof PER_ELEMENT_READS)[number], number>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// F2 holds no Private: the behaviour created under it is wrapped on create, which is no move. The prune reads the
		// wrapper the create made, as for every create of one
		'a behaviour created under F2 → no document read': {
			sourceXml: twoVoltageLevels,
			parent: { tagName: 'Function', id: 'f2' },
			expected: { findAncestors: 0, findDescendants: 0, getRecord: 1, getTree: 0 },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const counts = await source.transaction(async function createThenCount(tx) {
			await tx.any.addChild(testCase.parent, {
				tagName: 'BehaviorDescription',
				namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
				attributes: { name: 'BD9' },
			})
			const counted = countDocumentQueryReads(tx)
			await beforeCommit({ operations: tx.getStagedOperations(), query: counted.query })
			const calls = counted.calls()
			return Object.fromEntries(
				PER_ELEMENT_READS.map((method) => [
					method,
					calls.filter((call) => call.method === method).length,
				]),
			)
		})
		expect(counts).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
