import dataSetsXml from './fixtures/an-ied-with-two-data-sets-named-alike.xml?raw'
import twoBaysXml from './fixtures/two-bays-and-two-voltage-levels.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { ApplyMoveParams, ReportMoveParams } from './move.types'
import type { Scl } from '@/v2019C1/config'
import type { CommitPrune } from '@/v2019C1/extensions/clean-up/transaction/commit-prune.types'
import type { SclTest } from '@/v2019C1/test'

// two-bays-and-two-voltage-levels.xml: S1/VL1/B1 holds C1 (naming F1), QA1 (on L1), L1, F1 (SF1/XCBR1, PTRC1, CSWI1);
// S1/VL1/B2 holds C1 (c2), QA2 (on L1), F2 (inputs from PTRC1 and XCBR1, CSWI1 ln2); S1/VL2/B3 holds F1 (f9) and F7.
// F1 also holds its behaviour FB naming XCBR1.
// an-ied-with-two-data-sets-named-alike.xml: LD1's LLN0 holds DS1 (sent by gcb1), LD2's LLN0 its own DS1

// The move written and committed: the paths follow, and the name the report proposes is written unless the review
// gives one, numbered when taken there too.
describe('tx.lifecycle.applyMove - the move written', () => {
	type AppliedCase = SclTest.BaseXmlTestCase & { move: ApplyMoveParams }

	const testCases: SclTest.TestCases<AppliedCase> = {
		'F1 to B2 → F1 under B2 with its uuid, the category and the inputs naming it there': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('Bay', 'b2') },
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:Function[@name="F1"][@uuid="f1"]',
				'//v2019C1:FunctionCatRef[@function="S1/VL1/B2/F1"][@functionUuid="f1"]',
				'//v2019C1:SourceRef[@source="S1/VL1/B2/F1/PTRC1.Op"][@sourceLNodeUuid="ln1"]',
			],
			unexpectedQueries: ['//default:Bay[@name="B1"]/default:Function'],
		},
		'B1 to VL2 → its node and both terminals named under VL2': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Bay', 'b1'), parent: ref('VoltageLevel', 'vl2') },
			expectedQueries: [
				'//default:VoltageLevel[@name="VL2"]/default:Bay[@name="B1"]/default:ConnectivityNode[@pathName="S1/VL2/B1/L1"]',
				'//default:Bay[@name="B1"]//default:Terminal[@connectivityNode="S1/VL2/B1/L1"][@voltageLevelName="VL2"]',
				'//default:Bay[@name="B2"]//default:Terminal[@connectivityNode="S1/VL2/B1/L1"][@voltageLevelName="VL2"]',
			],
			unexpectedQueries: ['//default:Terminal[@voltageLevelName="VL1"]'],
		},
		// B3 holds a function F1 already
		'F1 to B3 without a rename → the proposed name F1_1 written, the uuid kept': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('Bay', 'b3') },
			expectedQueries: [
				'//default:Bay[@name="B3"]/default:Function[@name="F1_1"][@uuid="f1"]',
				'//v2019C1:FunctionCatRef[@function="S1/VL2/B3/F1_1"]',
			],
		},
		// B3 holds F7 too: the name typed is taken as well
		'F1 to B3 renamed F7, a name B3 holds → numbered F7_1': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('Bay', 'b3'), rename: { name: 'F7' } },
			expectedQueries: ['//default:Bay[@name="B3"]/default:Function[@name="F7_1"][@uuid="f1"]'],
		},
		// the categories of a bay are compared through its Private: B2's holds a C1
		'C1 to the Private of B2 → numbered C1_1 there, its uuid kept': {
			sourceXml: twoBaysXml,
			move: { ref: ref('FunctionCategory', 'c1'), parent: ref('Private', 'b2-private') },
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:Private/v2019C1:FunctionCategory[@name="C1_1"][@uuid="c1"]',
			],
			unexpectedQueries: ['//default:Bay[@name="B1"]//v2019C1:FunctionCategory'],
		},
		'F7 before F1 in B3 → F7 the first function of B3, F1 the second': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f7'), parent: ref('Bay', 'b3'), before: ref('Function', 'f9') },
			expectedQueries: [
				'//default:Bay[@name="B3"]/default:Function[1][@name="F7"]',
				'//default:Bay[@name="B3"]/default:Function[2][@name="F1"]',
			],
		},
		// the uuid is no editable attribute: it is ignored
		'F1 to B3 renamed F9 with a uuid given → F9 written, the uuid given ignored': {
			sourceXml: twoBaysXml,
			move: {
				ref: ref('Function', 'f1'),
				parent: ref('Bay', 'b3'),
				rename: { name: 'F9', uuid: 'another-uuid' },
			},
			expectedQueries: ['//default:Bay[@name="B3"]/default:Function[@name="F9"][@uuid="f1"]'],
			unexpectedQueries: ['//default:Function[@uuid="another-uuid"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<AppliedCase>): Promise<SclTest.ActResult> {
		const committed = source
			.transaction(async function applyTheMove(tx) {
				await tx.lifecycle.applyMove(testCase.move)
			})
			.then(() => 'committed')
		await expect(committed).resolves.toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// What the report refuses, the move written refuses too, with the first refusal the report lists.
describe('tx.lifecycle.applyMove - refused as the report refuses', () => {
	type RefusedCase = SclTest.BaseXmlTestCase & {
		move: ReportMoveParams
		/** The key of the first refusal of the report, and of the error the written move is refused with. */
		expected: string
	}

	const testCases: SclTest.TestCases<RefusedCase> = {
		// CSWI1 (ln4) and CSWI1 of F2 share every field of the LNode's key
		'CSWI1 of F1 to F2, which holds a CSWI1 of the same key → IDENTITY_COLLISION, reported and refused':
			{
				sourceXml: twoBaysXml,
				move: { ref: ref('LNode', 'ln4'), parent: ref('Function', 'f2') },
				expected: 'IDENTITY_COLLISION',
			},
		// gcb1 names DS1 within its own logical node
		'DS1 to the LLN0 of LD2 → MOVE_NOT_FOLLOWED, reported and refused at the commit': {
			sourceXml: dataSetsXml,
			move: { ref: ref('DataSet', 'ds1'), parent: ref('LN0', 'ld2-lln0') },
			expected: 'MOVE_NOT_FOLLOWED',
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<RefusedCase>): Promise<void> {
		const both = firstReported({ source, move: testCase.move }).then(
			async function thenApplied(reported) {
				const applied = await source
					.transaction(async function applyTheMove(tx) {
						await tx.lifecycle.applyMove(testCase.move)
					})
					.then(
						() => 'committed',
						(error: unknown) => toDialecteError(error)?.key ?? String(error),
					)
				return { reported, applied }
			},
		)
		await expect(both).resolves.toEqual({ reported: testCase.expected, applied: testCase.expected })
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The commit's side effects come from the preview after the move is written (the Confirm step), and equal what the
// preview reads in the report's own transaction: report == apply.
describe('tx.lifecycle.applyMove - the commit preview the same as in the report', () => {
	type ParityCase = SclTest.BaseXmlTestCase & { move: ReportMoveParams }

	const testCases: SclTest.TestCases<ParityCase> = {
		'F1 to B2 → the same preview': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('Bay', 'b2') },
		},
		'B1 to VL2 → the same preview': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Bay', 'b1'), parent: ref('VoltageLevel', 'vl2') },
		},
		// the Private of B1 holds only C1: it is pruned
		'C1 to the Private of B2 → the same preview, the emptied Private of B1 in both': {
			sourceXml: twoBaysXml,
			move: { ref: ref('FunctionCategory', 'c1'), parent: ref('Private', 'b2-private') },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ParityCase>): Promise<void> {
		const both = previewAfter({
			source,
			write: async (tx) => {
				await tx.lifecycle.reportMove(testCase.move)
			},
		}).then(async function thenApplied(reported) {
			const applied = await previewAfter({
				source,
				write: async (tx) => {
					await tx.lifecycle.applyMove(testCase.move)
				},
			})
			return { reported, applied }
		})
		// the written move stages the proposed name too: the count of staged operations is left out
		const compared = both.then(function compare({ reported, applied }) {
			expect(sideEffectsOf(applied)).toEqual(sideEffectsOf(reported))
			return 'same preview'
		})
		await expect(compared).resolves.toBe('same preview')
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type Source = SclTest.ActParams<SclTest.BaseXmlTestCase>['source']

/** What a preview says the commit does beside the edits: its count of staged operations left out. */
function sideEffectsOf(preview: CommitPrune): Omit<CommitPrune, 'stagedCount' | 'normalised'> {
	const { containers, types, moves, released, refusals } = preview
	return { containers, types, moves, released, refusals }
}

/** A ref of a fixture, by tag and id. */
function ref(tagName: string, id: string): Scl.Ref<Scl.ElementsOf> {
	return { tagName, id } as Scl.Ref<Scl.ElementsOf>
}

/** The key of the first refusal the report of a move lists, in a transaction then discarded. */
async function firstReported(params: { source: Source; move: ReportMoveParams }): Promise<string> {
	const { source, move } = params
	let first: string | undefined
	let failure: unknown
	await source
		.prepare(async function reportThenDiscard(tx) {
			first = await tx.lifecycle.reportMove(move).then(
				(report) => report.refusals[0]?.key ?? 'none',
				function kept(error: unknown) {
					failure = error
					return undefined
				},
			)
		})
		.then(
			(prepared) => prepared.discard(),
			() => undefined,
		)
	if (failure) throw failure
	return first ?? 'none'
}

/** The commit preview after `write`, the transaction discarded. */
async function previewAfter(params: {
	source: Source
	write: (tx: Scl.Transaction) => Promise<void>
}): Promise<CommitPrune> {
	const { source, write } = params
	let preview: CommitPrune | undefined
	let failure: unknown
	await source
		.prepare(async function writeThenPreview(tx) {
			preview = await write(tx)
				.then(() => tx.cleanUp.commitPrune())
				.catch(function kept(error: unknown) {
					failure = error
					return undefined
				})
		})
		.then(
			(prepared) => prepared.discard(),
			() => undefined,
		)
	if (failure) throw failure
	if (!preview) throw new Error('no preview')
	return preview
}
