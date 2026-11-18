import twelveLNodesXml from './fixtures/twelve-lnodes-each-first-trip-input-referenced.xml?raw'
import { followAncestry } from './follow-ancestry'

import { describe, expect } from 'vitest'

import { countQueryReads } from '@/v2019C1/test/count-query-reads'
import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { CountedQueryCall } from '@/v2019C1/test/count-query-reads.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The LNodes `ln0` to `ln11` of the fixture, each with two `Trip` inputs, the first referenced as `Trip(1)`. */
const LNODES = 12

/** A query call whose first argument is a signal parent, or a list holding one (a ref or a record). */
function namesSignalParent(call: CountedQueryCall): boolean {
	const [first] = call.args
	const given: unknown[] = Array.isArray(first) ? first : [first]
	return given.some(
		(item) =>
			typeof item === 'object' &&
			item !== null &&
			'tagName' in item &&
			item.tagName === 'LNodeInputs',
	)
}

/**
 * Following the references of signals read alone reads their siblings in one batch: the query calls naming a signal
 * parent stay two (the parents, their children) whatever the number of parents, was two per parent.
 */
describe('followAncestry - the siblings of signals read alone', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		roots: number
		expected: { parentCalls: number; operations: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		[`the first input of each of ${LNODES} LNodes followed → 2 calls naming their parents, each InputVar kept as "Trip(1)"`]:
			{
				// twelve LNodes, each two SourceRefs input "Trip" and an InputVar naming the first by uuid as "Trip(1)"
				sourceXml: twelveLNodesXml,
				roots: LNODES,
				expected: { parentCalls: 2, operations: 0 },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const { query, calls } = countQueryReads(source.query)
			const roots = Array.from({ length: testCase.roots }, (_, index) => ({
				root: { tagName: 'SourceRef', id: `ln${index}-sr-0` } as Scl.Ref<Scl.ElementsOf>,
				references: true,
				ownPath: false,
				below: false,
			}))
			const operations = await followAncestry(query, { roots })
			const parentCalls = calls.filter(namesSignalParent).length
			// a signal named without its siblings would be "Trip": its InputVar would be rewritten
			expect({ parentCalls, operations: operations.length }).toEqual(testCase.expected)
		},
	})
})
