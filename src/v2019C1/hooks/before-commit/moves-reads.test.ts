import { beforeCommit } from './before-commit'
import twoVoltageLevels from './fixtures/two-voltage-levels-with-functions-and-nodes.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/** The reads of one element or one subtree, each counted. */
const PER_ELEMENT_READS = ['findAncestors', 'findDescendants', 'getRecord', 'getTree'] as const

describe('the reads of a commit following moves', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		moves: { element: Scl.Ref<Scl.ElementsOf>; parent: Scl.Ref<Scl.ElementsOf> }[]
		/** The times each per-element read is called. */
		expected: Record<(typeof PER_ELEMENT_READS)[number], number>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// F1 (named from B1 and from F2) goes to B2, B1 (holding L1, named by a terminal outside it) goes to VL2
		'two moves, named from outside, with terminals → the document read once, nothing per moved subtree or element':
			{
				sourceXml: twoVoltageLevels,
				moves: [
					{ element: { tagName: 'Function', id: 'f1' }, parent: { tagName: 'Bay', id: 'b2' } },
					{ element: { tagName: 'Bay', id: 'b1' }, parent: { tagName: 'VoltageLevel', id: 'vl2' } },
				],
				expected: { findAncestors: 0, findDescendants: 0, getRecord: 0, getTree: 1 },
			},
		// F2 goes into B1, then B1 (now holding F2) goes to VL2: F2 is moved inside a moved root
		'a move nested in another moved root → the document read once, nothing per moved subtree or element':
			{
				sourceXml: twoVoltageLevels,
				moves: [
					{ element: { tagName: 'Function', id: 'f2' }, parent: { tagName: 'Bay', id: 'b1' } },
					{ element: { tagName: 'Bay', id: 'b1' }, parent: { tagName: 'VoltageLevel', id: 'vl2' } },
				],
				expected: { findAncestors: 0, findDescendants: 0, getRecord: 0, getTree: 1 },
			},
		// C1 sits in the Private of B1; B2 holds none: the move wraps it. The prune reads the emptied Private once, as after
		// a delete of C1
		'an element of the extension moved under a parent with no Private → the document read once, nothing per moved element':
			{
				sourceXml: twoVoltageLevels,
				moves: [
					{
						element: { tagName: 'FunctionCategory', id: 'c1' },
						parent: { tagName: 'Bay', id: 'b2' },
					},
				],
				expected: { findAncestors: 0, findDescendants: 0, getRecord: 1, getTree: 1 },
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const counts = await source.transaction(async function moveThenCount(tx) {
			for (const { element, parent } of testCase.moves) await tx.any.move(element, { parent })
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
