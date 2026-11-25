import dataSetsXml from './fixtures/an-ied-with-two-data-sets-named-alike.xml?raw'
import twoBaysXml from './fixtures/two-bays-and-two-voltage-levels.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { MoveReport, ReportMoveParams } from './move.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type RefusedCase = SclTest.BaseXmlTestCase & {
	move: ReportMoveParams
	/** Each refusal the report lists, `<key> <code>`, in its order. */
	refusals: string[]
	/** The name taken, `<value> → <proposed>`, when there is one. */
	nameTaken?: string
	/** The element moved, `<id> -> <parent id>`; absent when core refused the anchors. */
	moved?: string
	/** The instances of the report: none when core refused the anchors. */
	instances: number
	/** The operations staged once the report ran (the move, and its two parents). */
	staged: number
}

// two-bays-and-two-voltage-levels.xml: S1/VL1/B1 holds F1 (SF1, PTRC1, CSWI1 ln4); S1/VL1/B2 holds F2 (CSWI1 ln2);
// S1/VL2/B3 holds F1 (f9) and F7, each with a Text. an-ied-with-two-data-sets-named-alike.xml: LD1's LLN0 holds DS1
// (sent by gcb1), LD2's LLN0 holds its own DS1; IED B holds LDB
describe('tx.lifecycle.reportMove - every refusal listed up front', () => {
	const testCases: SclTest.TestCases<RefusedCase> = {
		'F1 under its own SubFunction → MOVE_INTO_OWN_SUBTREE listed': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('SubFunction', 'sf1') },
			refusals: ['MOVE_INTO_OWN_SUBTREE D3015'],
			instances: 0,
			staged: 0,
		},
		// a Function holds one Text at most
		"F1's Text to F7, which holds one → MAX_OCCURRENCES_REACHED listed": {
			sourceXml: twoBaysXml,
			move: { ref: ref('Text', 'f9-text'), parent: ref('Function', 'f7') },
			refusals: ['MAX_OCCURRENCES_REACHED D3014'],
			instances: 0,
			staged: 0,
		},
		// F2 is a function, of B2, not of B1
		'F1 in B1 before F2 of B2 → MOVE_BEFORE_NOT_SIBLING listed': {
			sourceXml: twoBaysXml,
			move: {
				ref: ref('Function', 'f1'),
				parent: ref('Bay', 'b1'),
				before: ref('Function', 'f2'),
			},
			refusals: ['MOVE_BEFORE_NOT_SIBLING D3016'],
			instances: 0,
			staged: 0,
		},
		'the document root moved → PROTECTED_ROOT listed': {
			sourceXml: twoBaysXml,
			move: { ref: ref('SCL', 'project'), parent: ref('Bay', 'b1') },
			refusals: ['PROTECTED_ROOT D3003'],
			instances: 0,
			staged: 0,
		},
		'an element the document does not hold → ELEMENT_NOT_FOUND listed': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'no-such-function'), parent: ref('Bay', 'b1') },
			refusals: ['ELEMENT_NOT_FOUND D2001'],
			instances: 0,
			staged: 0,
		},
		'a parent the document does not hold → ELEMENT_NOT_FOUND listed': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('Bay', 'no-such-bay') },
			refusals: ['ELEMENT_NOT_FOUND D2001'],
			instances: 0,
			staged: 0,
		},
		// CSWI1 (ln4) and CSWI1 of F2 (ln2) share every field of the LNode's key: nothing can be renamed
		'CSWI1 of F1 to F2, which holds a CSWI1 of the same key → IDENTITY_COLLISION listed, no name taken':
			{
				sourceXml: twoBaysXml,
				move: { ref: ref('LNode', 'ln4'), parent: ref('Function', 'f2') },
				refusals: ['IDENTITY_COLLISION SCL1010'],
				moved: 'ln4 -> f2',
				instances: 1,
				staged: 3,
			},
		// gcb1 names DS1 within its own logical node: a move does not follow it; LD2's LLN0 holds a DS1 already
		'DS1 to the LLN0 of LD2 → MOVE_NOT_FOLLOWED listed, and the name taken with DS1_1 proposed': {
			sourceXml: dataSetsXml,
			move: { ref: ref('DataSet', 'ds1'), parent: ref('LN0', 'ld2-lln0') },
			refusals: ['MOVE_NOT_FOLLOWED SCL4003'],
			nameTaken: 'DS1 → DS1_1',
			moved: 'ds1 -> ld2-lln0',
			instances: 1,
			staged: 3,
		},
		// LD1 holds its LLN0, DS1 and gcb1, all named by their place: one refusal for the move
		'LD1 to the server of IED B → one MOVE_NOT_FOLLOWED for the move, however many unfollowed records it holds':
			{
				sourceXml: dataSetsXml,
				move: { ref: ref('LDevice', 'ld1'), parent: ref('Server', 'b-server') },
				refusals: ['MOVE_NOT_FOLLOWED SCL4003'],
				moved: 'ld1 -> b-server',
				instances: 1,
				staged: 3,
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<RefusedCase>): Promise<void> {
		const described = reported({ source, move: testCase.move }).then(function describe({
			report,
			staged,
		}) {
			const { move } = report
			const taken = move?.nameTaken
			return {
				refusals: report.refusals.map((refusal) => `${refusal.key} ${refusal.code}`),
				nameTaken: taken ? `${taken.value} → ${taken.proposed}` : undefined,
				moved: move ? `${move.element.id} -> ${move.to.id}` : undefined,
				instances: report.instances.length,
				staged,
			}
		})
		await expect(described).resolves.toEqual({
			refusals: testCase.refusals,
			nameTaken: testCase.nameTaken,
			moved: testCase.moved,
			instances: testCase.instances,
			staged: testCase.staged,
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The report stages the move in the transaction it is given, which the caller discards: a transaction holding other
// writes would be discarded with them.
describe('tx.lifecycle.reportMove - a transaction holding staged writes', () => {
	type StagedCase = SclTest.BaseXmlTestCase & {
		move: ReportMoveParams
		/** The write staged before the report. */
		write: (tx: Scl.Transaction) => Promise<void>
	}

	const testCases: SclTest.TestCases<StagedCase> = {
		// F7's description changed first
		'a write staged before the report → refused with ASSERTION_FAILED, nothing reported': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('Bay', 'b2') },
			write: async function describeF7(tx) {
				await tx.any.update(ref('Function', 'f7'), { attributes: { desc: 'spare bay function' } })
			},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<StagedCase>): Promise<void> {
		let refused: string | undefined
		await source
			.prepare(async function writeThenReport(tx) {
				await testCase.write(tx)
				refused = await tx.lifecycle.reportMove(testCase.move).then(
					() => 'reported',
					(error: unknown) => toDialecteError(error)?.key ?? String(error),
				)
			})
			.then(
				(prepared) => prepared.discard(),
				() => undefined,
			)
		expect(refused).toBe('ASSERTION_FAILED')
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type Source = SclTest.ActParams<SclTest.BaseXmlTestCase>['source']

/** A ref of a fixture, by tag and id. */
function ref(tagName: string, id: string): Scl.Ref<Scl.ElementsOf> {
	return { tagName, id } as Scl.Ref<Scl.ElementsOf>
}

/**
 * The report of a move, and the operations its transaction then holds (read by the commit preview, which lists every
 * refusal instead of throwing), the transaction discarded.
 */
async function reported(params: {
	source: Source
	move: ReportMoveParams
}): Promise<{ report: MoveReport; staged: number }> {
	const { source, move } = params
	let report: MoveReport | undefined
	let staged = -1
	let failure: unknown
	await source
		.prepare(async function reportThenDiscard(tx) {
			report = await tx.lifecycle.reportMove(move).catch(function kept(error: unknown) {
				failure = error
				return undefined
			})
			if (report) staged = (await tx.cleanUp.commitPrune({ collect: true })).stagedCount
		})
		.then(
			(prepared) => prepared.discard(),
			() => undefined,
		)
	if (failure) throw failure
	if (!report) throw new Error('no report')
	return { report, staged }
}
