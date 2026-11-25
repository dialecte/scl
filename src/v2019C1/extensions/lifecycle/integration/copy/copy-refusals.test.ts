import { describeRefusals, keyOf, ref, reportCopy, copyTarget } from './copy-helpers'
import incoherentXml from './fixtures/a-function-with-incoherent-references.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { CommitRefusal } from '@/v2019C1/hooks/before-commit/commit-plan.types'
import type { SclTest } from '@/v2019C1/test'

// a-function-with-incoherent-references.xml: F1's behaviour FB holds In (fb-in) naming PTRC1 without its data and Both
// (fb-both) holding the data and the control groups together, written before the checks existed; the behaviour BB of B1
// applies to F1 (its Op output naming F1's PTRC1) and its Block input (bb-block) names F3's CSWI1, in B1. B2 holds nothing.

const TO_B2: CopyCase = { verb: 'fsd', ref: ref('Function', 'f1'), anchor: ref('Bay', 'b2') }

/** Every refusal the commit of F1's copy under B2 raises: the two it copies, and BB's input naming out of B2's reach. */
const REFUSED = [
	'SCL4004 data-missing InputVar lnodeUuid',
	'SCL4004 groups-together OutputVar outputUuid',
	'SCL4004 out-of-scope InputVar lnodeUuid',
]

// The report lists, before anything is written, every refusal the commit of the copy would raise, by the source element.
describe('fsd copy - the refusals of its commit, reported', () => {
	type ReportedCase = SclTest.BaseXmlTestCase & { copy: CopyCase; expected: string[] }

	const testCases: SclTest.TestCases<ReportedCase> = {
		// FB holds In and Both, written incoherently; BB applies to F1 and names F3 in B1
		'F1 to B2 → the two incoherent references it copies and the input out of reach, each named by its source element':
			{
				sourceXml: incoherentXml,
				copy: TO_B2,
				expected: [
					'SCL4004 data-missing InputVar#fb-in lnodeUuid',
					'SCL4004 groups-together OutputVar#fb-both outputUuid',
					'SCL4004 out-of-scope InputVar#bb-block lnodeUuid',
				],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReportedCase>): Promise<void> {
		const listed = reportCopy({ document: source, copy: testCase.copy }).then((report) =>
			describeBySource(report.refusals ?? []),
		)
		await expect(listed).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The refusals the report lists are those the commit's own plan lists once the copy is written, and the commit refuses
// with the first.
describe('fsd copy - the refusals of its commit, as the commit lists them', () => {
	type CommittedCase = SclTest.BaseXmlTestCase & { copy: CopyCase }

	const testCases: SclTest.TestCases<CommittedCase> = {
		// FB holds In and Both, written incoherently; BB applies to F1 and names F3 in B1
		'F1 to B2 → the report lists what the commit plan lists; the commit refuses with REFERENCE_INCOHERENT':
			{
				sourceXml: incoherentXml,
				copy: TO_B2,
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<CommittedCase>): Promise<void> {
		const compared = reportCopy({ document: source, copy: testCase.copy }).then(
			async function thenApplyAndPlan(report) {
				let planned: CommitRefusal[] = []
				const commit = await source
					.transaction(async function applyThenPlan(tx) {
						await tx.lifecycle.apply({
							...copyTarget({ sourceQuery: source.query, copy: testCase.copy }),
							report,
						})
						planned = (await tx.cleanUp.commitPrune({ collect: true })).refusals
					})
					.then(() => 'committed', keyOf)
				const [reported, plannedAtCommit] = [report.refusals ?? [], planned].map(describeRefusals)
				return { reported, planned: plannedAtCommit, commit }
			},
		)
		await expect(compared).resolves.toEqual({
			reported: REFUSED,
			planned: REFUSED,
			commit: 'REFERENCE_INCOHERENT',
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The refusals with the source element each names. */
function describeBySource(refusals: readonly CommitRefusal[]): string[] {
	return refusals
		.map(function describeRefusal(refusal) {
			if (refusal.key !== 'REFERENCE_INCOHERENT') return refusal.key
			const { reason, reference, uuidAttribute } = refusal.meta
			return `${refusal.code} ${reason} ${reference.tagName}#${reference.id} ${uuidAttribute}`
		})
		.sort()
}
