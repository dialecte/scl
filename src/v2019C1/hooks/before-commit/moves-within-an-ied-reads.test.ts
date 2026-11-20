import { beforeCommit } from './before-commit'
import aTripNamedAcrossTheProject from './fixtures/a-trip-named-across-the-project.xml?raw'
import twoAccessPointsOnOneBus from './fixtures/an-ied-with-two-access-points-on-one-bus.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/** The reads of one element or one subtree, and the batched reads of records by ref, each counted. */
const PER_ELEMENT_READS = [
	'findAncestors',
	'findDescendants',
	'getRecord',
	'getRecords',
	'getTree',
] as const

// A move within an IED is followed from the document the move step reads once and from one read of each referrer tag:
// nothing is read per referrer, per moved element or per address.
describe('the reads of a commit following a move within an IED', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		element: Scl.Ref<Scl.ElementsOf>
		parent: Scl.Ref<Scl.ElementsOf>
		/** The times each per-element read is called. */
		expected: Record<(typeof PER_ELEMENT_READS)[number], number>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// PTRC1, named by an LNode, three ExtRefs, an FCDA, a ClientLN, an IEDName and a SourceRef, goes to CTRL: the names
		// are written from the document read once (getTree) and the tuple step climbs nothing; the two getRecord are the
		// path follower reading the holders (LNodeInputs, Private) of the SourceRef whose address it writes again
		'PTRC1 moved to CTRL, named from seven places → the document read once, nothing per referrer named by a tuple':
			{
				sourceXml: aTripNamedAcrossTheProject,
				element: { tagName: 'LN', id: 'ptrc1' },
				parent: { tagName: 'LDevice', id: 'ctrl' },
				expected: { findAncestors: 0, findDescendants: 0, getRecord: 2, getRecords: 1, getTree: 1 },
			},
		// CTRL goes to AP2's server: its GSE finds AP2's connection in the same document read; the getRecord and two of the
		// getRecords are the prune judging the server CTRL left (its record, its children, the access point above it), as
		// after a delete
		'CTRL moved to AP2 → its GSE carried from the document read, nothing per address': {
			sourceXml: twoAccessPointsOnOneBus,
			element: { tagName: 'LDevice', id: 'ctrl' },
			parent: { tagName: 'Server', id: 'bcu1-server2' },
			expected: { findAncestors: 0, findDescendants: 0, getRecord: 1, getRecords: 3, getTree: 1 },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const counts = await source.transaction(async function moveThenCount(tx) {
			await tx.any.move(testCase.element, { parent: testCase.parent })
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
