import twoBaysXml from './fixtures/two-bays-and-two-voltage-levels.xml?raw'
import { reportMove } from './report-move'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { ReportMoveParams } from './move.types'
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

type Counts = Record<(typeof PER_ELEMENT_READS)[number], number>

// A report runs the commit's plan once: the document is read once by its move step, the new parent's scope once; the
// reads do not grow with what the move carries. A consumer session runs about three plans (the report, the preview
// after the move is written, the Confirm commit).
describe('the reads of tx.lifecycle.reportMove', () => {
	type ReadsCase = SclTest.BaseXmlTestCase & {
		/** A small move and a large one, reported each in its own transaction. */
		small: ReportMoveParams
		large: ReportMoveParams
	}

	const testCases: SclTest.TestCases<ReadsCase> = {
		// F1 carries 5 records, B1 12; both are named from outside
		"F1 to B2 and B1 to VL2 → the same reads: the document once, the new parent's scope once": {
			sourceXml: twoBaysXml,
			small: { ref: ref('Function', 'f1'), parent: ref('Bay', 'b2') },
			large: { ref: ref('Bay', 'b1'), parent: ref('VoltageLevel', 'vl2') },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReadsCase>): Promise<void> {
		const counted = countedReport({ source, move: testCase.small }).then(
			async function thenLarge(small) {
				const large = await countedReport({ source, move: testCase.large })
				return {
					treeReads: small.getTree,
					sameReads: JSON.stringify(small) === JSON.stringify(large),
				}
			},
		)
		// one tree read is the document the move step reads, the other the new parent's scope
		await expect(counted).resolves.toEqual({ treeReads: 2, sameReads: true })
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type Source = SclTest.ActParams<SclTest.BaseXmlTestCase>['source']

/** A ref of the fixture, by tag and id. */
function ref(tagName: string, id: string): Scl.Ref<Scl.ElementsOf> {
	return { tagName, id } as Scl.Ref<Scl.ElementsOf>
}

/** The per-element reads of one report, in a transaction then discarded. */
async function countedReport(params: { source: Source; move: ReportMoveParams }): Promise<Counts> {
	const { source, move } = params
	let counts: Counts | undefined
	let failure: unknown
	await source
		.prepare(async function reportThenCount(tx) {
			const reads = countDocumentQueryReads(tx)
			await reportMove(reads.query, move).catch(function kept(error: unknown) {
				failure = error
			})
			const calls = reads.calls()
			counts = Object.fromEntries(
				PER_ELEMENT_READS.map((method) => [
					method,
					calls.filter((call) => call.method === method).length,
				]),
			) as Counts
		})
		.then(
			(prepared) => prepared.discard(),
			() => undefined,
		)
	if (failure) throw failure
	if (!counts) throw new Error('no counts')
	return counts
}
