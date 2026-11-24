import breakersAndATripInputXml from '../../../hooks/before-commit/fixtures/breakers-and-a-trip-input.xml?raw'
import severalRefusalsXml from '../../../hooks/before-commit/fixtures/commit-refusals-incoherent-references.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CommitPrune } from './commit-prune.types'
import type { Scl } from '@/v2019C1/config'
import type { CommitRefusal } from '@/v2019C1/hooks/before-commit/commit-plan.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

// commit-refusals-incoherent-references.xml: F1 holds the behaviour FB (naming XCBR1 of SF1 and its control CTL2), PTRC1
// and SF1; F2 holds CSWI1, out of FB's reach. IED A: AP1 on N1 (CTRL sending PositionGoose; LD1 with DS1, gcb1 and the
// data instance Op; LD2; LD4 holding GGIO1 and its data instance), AP2 connected nowhere. IED B: AP1 on N1.
const FUNCTION_BEHAVIOUR = { tagName: 'BehaviorDescription', id: 'fb' } as Scl.Ref<Scl.ElementsOf>

/** What the transaction writes before the preview: answers the ids of the references it created, by label. */
type Write = (tx: Scl.Transaction) => Promise<Record<string, string>>

/** A move of the transaction. */
type Move = { element: Scl.Ref<Scl.ElementsOf>; parent: Scl.Ref<Scl.ElementsOf> }

const CTRL_TO_UNCONNECTED_AP2: Move = {
	element: { tagName: 'LDevice', id: 'ctrl' } as Scl.Ref<Scl.ElementsOf>,
	parent: { tagName: 'Server', id: 'a-server2' } as Scl.Ref<Scl.ElementsOf>,
}
const OP_TO_ANOTHER_LN: Move = {
	element: { tagName: 'DOI', id: 'op' } as Scl.Ref<Scl.ElementsOf>,
	parent: { tagName: 'LN', id: 'ld2-xcbr1' } as Scl.Ref<Scl.ElementsOf>,
}
const DS1_TO_ANOTHER_LD: Move = {
	element: { tagName: 'DataSet', id: 'ds1' } as Scl.Ref<Scl.ElementsOf>,
	parent: { tagName: 'LN0', id: 'ld2-lln0' } as Scl.Ref<Scl.ElementsOf>,
}
const LD4_TO_ANOTHER_IED: Move = {
	element: { tagName: 'LDevice', id: 'ld4' } as Scl.Ref<Scl.ElementsOf>,
	parent: { tagName: 'Server', id: 'b-server' } as Scl.Ref<Scl.ElementsOf>,
}
const GSE1_TO_ANOTHER_IED: Move = {
	element: { tagName: 'GSE', id: 'gse1' } as Scl.Ref<Scl.ElementsOf>,
	parent: { tagName: 'ConnectedAP', id: 'connected-ap-b' } as Scl.Ref<Scl.ElementsOf>,
}
// a path-reference move the commit follows: XCBR1 and CTL2 leave FB's reach
const SF1_TO_F2: Move = {
	element: { tagName: 'SubFunction', id: 'sf1' } as Scl.Ref<Scl.ElementsOf>,
	parent: { tagName: 'Function', id: 'f2' } as Scl.Ref<Scl.ElementsOf>,
}

type RefusalsCase = SclTest.BaseXmlTestCase & {
	write: Write
	/** Each refusal the preview lists, as `describeRefusal` writes it, in its order. */
	refusals: string[]
}

// With `{ collect: true }` the preview lists every move the commit does not follow and every incoherent uuid reference
// the transaction writes, in the order the commit judges them, instead of throwing the first.
describe('tx.cleanUp.commitPrune({ collect: true }) - every refusal of the commit, as data', () => {
	const testCases: SclTest.TestCases<RefusalsCase> = {
		// the unconnected address is judged first, then the moved subtrees in document order at their new place
		'five moves of every family the commit does not follow → each listed, in the order the commit judges them':
			{
				sourceXml: severalRefusalsXml,
				write: moving([
					CTRL_TO_UNCONNECTED_AP2,
					OP_TO_ANOTHER_LN,
					DS1_TO_ANOTHER_LD,
					LD4_TO_ANOTHER_IED,
					GSE1_TO_ANOTHER_IED,
				]),
				refusals: [
					'MOVE_NOT_FOLLOWED SCL4003 LDevice ctrl under Server a-server2',
					'MOVE_NOT_FOLLOWED SCL4003 GSE gse1 under ConnectedAP connected-ap-b',
					'MOVE_NOT_FOLLOWED SCL4003 DataSet ds1 under LN0 ld2-lln0',
					'MOVE_NOT_FOLLOWED SCL4003 DOI op under LN ld2-xcbr1',
					'MOVE_NOT_FOLLOWED SCL4003 LDevice ld4 under Server b-server',
				],
			},
		// LD4 holds itself, its LLN0, GGIO1 and its data instance: what references name by its place, four records
		'one move holding several records the commit does not follow → one refusal, for that move': {
			sourceXml: severalRefusalsXml,
			write: moving([LD4_TO_ANOTHER_IED]),
			refusals: ['MOVE_NOT_FOLLOWED SCL4003 LDevice ld4 under Server b-server'],
		},
		// written in this order: out-of-scope (CSWI1 is in F2), data-missing, groups-together; the commit judges the groups
		// and the data of every written reference first, then their reach
		'three uuid references written incoherently → each listed, groups and data first, then reach': {
			sourceXml: severalRefusalsXml,
			write: writingIncoherentReferences,
			refusals: [
				'REFERENCE_INCOHERENT SCL4004 InputVar <no-data> lnodeUuid data-missing',
				'REFERENCE_INCOHERENT SCL4004 InputVar <both-groups> inputUuid groups-together',
				'REFERENCE_INCOHERENT SCL4004 OutputVar <out-of-reach> lnodeUuid out-of-scope',
			],
		},
		// the steps after the move step still run: the reference is judged too
		'a move the commit does not follow and an incoherent reference → both listed': {
			sourceXml: severalRefusalsXml,
			write: async function moveThenWrite(tx) {
				await moving([OP_TO_ANOTHER_LN])(tx)
				const created = await tx.any.addChild(FUNCTION_BEHAVIOUR, {
					tagName: 'InputVar',
					attributes: { varName: 'in', lnodeUuid: 'xcbr' },
				})
				return { 'no-data': created.id }
			},
			refusals: [
				'MOVE_NOT_FOLLOWED SCL4003 DOI op under LN ld2-xcbr1',
				'REFERENCE_INCOHERENT SCL4004 InputVar <no-data> lnodeUuid data-missing',
			],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<RefusalsCase>): Promise<void> {
		const listed = previewed({ source, write: testCase.write, collect: true }).then(
			function described({ preview, labels }) {
				return {
					refusals: preview.refusals.map((refusal) => describeRefusal({ refusal, labels })),
				}
			},
		)
		await expect(listed).resolves.toEqual({ refusals: testCase.refusals })
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The rest of the preview reads the commit as if the refused moves were accepted: what the followed moves remove is
// listed beside the refusals.
describe('tx.cleanUp.commitPrune({ collect: true }) - the side effects beside the refusals', () => {
	type SideEffectsCase = RefusalsCase & {
		/** Each element the moves remove, as `describeRemoval` writes it. */
		moves: string[]
	}

	const testCases: SclTest.TestCases<SideEffectsCase> = {
		// SF1's move is followed: XCBR1 and CTL2 leave FB's reach
		'a refused move and a followed path move → the refusal listed, the followed move removes what it puts out of reach':
			{
				sourceXml: severalRefusalsXml,
				write: moving([OP_TO_ANOTHER_LN, SF1_TO_F2]),
				refusals: ['MOVE_NOT_FOLLOWED SCL4003 DOI op under LN ld2-xcbr1'],
				moves: [
					'OutputVar stored-data cleared out-of-reach',
					'OutputVar stored-control cleared out-of-reach',
				],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<SideEffectsCase>): Promise<void> {
		const listed = previewed({ source, write: testCase.write, collect: true }).then(
			function described({ preview, labels }) {
				return {
					refusals: preview.refusals.map((refusal) => describeRefusal({ refusal, labels })),
					moves: preview.moves.map(describeRemoval),
				}
			},
		)
		await expect(listed).resolves.toEqual({ refusals: testCase.refusals, moves: testCase.moves })
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// A transaction the commit does not refuse: collecting changes nothing in the preview.
describe('tx.cleanUp.commitPrune({ collect: true }) - nothing refused', () => {
	type SameCase = SclTest.BaseXmlTestCase & { write: Write }

	const testCases: SclTest.TestCases<SameCase> = {
		// SF1 holds only what a move follows; its move clears FB's references out of reach
		'SF1 moved to F2, followed → no refusal, the preview the same as without collect': {
			sourceXml: severalRefusalsXml,
			write: moving([SF1_TO_F2]),
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<SameCase>): Promise<void> {
		const { preview: plain } = await previewed({ source, write: testCase.write, collect: false })
		const collected = previewed({ source, write: testCase.write, collect: true }).then(
			({ preview }) => preview,
		)
		await expect(
			collected.then((preview) => ({ plainRefusals: plain.refusals, preview })),
		).resolves.toEqual({ plainRefusals: [], preview: { ...plain, refusals: [] } })
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Collecting lists only the moves the commit does not follow and the incoherent uuid references: every other refusal of
// the commit still throws.
describe('tx.cleanUp.commitPrune({ collect: true }) - every other refusal still throws', () => {
	type ThrownCase = SclTest.BaseXmlTestCase & {
		write: Write
		/** The key and code of the error the collecting preview throws. */
		expected: string
	}

	const testCases: SclTest.TestCases<ThrownCase> = {
		// breakers-and-a-trip-input.xml: ref1 names XCBR1's Pos.stVal from the resource PR1; F1 holds no resource PR9
		'a path reference edited to name nothing → the collecting preview throws REFERENCE_NAMES_UNRESOLVED (SCL4002)':
			{
				sourceXml: breakersAndATripInputXml,
				write: async function pointAtNoResource(tx) {
					await tx.any.update({ tagName: 'SourceRef', id: 'ref1' } as Scl.Ref<Scl.ElementsOf>, {
						attributes: { resourceName: 'PR9' },
					})
					return {}
				},
				expected: 'REFERENCE_NAMES_UNRESOLVED SCL4002',
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<ThrownCase>): Promise<void> {
		const thrown = previewed({ source, write: testCase.write, collect: true }).then(
			() => 'no error',
			function errorOf(error: unknown) {
				const dialecteError = toDialecteError(error)
				return `${dialecteError?.key} ${dialecteError?.code}`
			},
		)
		await expect(thrown).resolves.toBe(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type Source = SclTest.ActParams<SclTest.BaseXmlTestCase>['source']

/** The preview after `write`, with the labels of the references it created, the transaction discarded. */
async function previewed(params: {
	source: Source
	write: Write
	collect: boolean
}): Promise<{ preview: CommitPrune; labels: Record<string, string> }> {
	const { source, write, collect } = params
	let preview: CommitPrune | undefined
	let labels: Record<string, string> = {}
	let failure: unknown
	let prepareFailure: unknown
	// prepare runs the commit's steps too: a refused transaction ends there, after the preview was taken
	await source
		.prepare(async function writeThenPreview(tx) {
			labels = await write(tx)
			preview = await tx.cleanUp.commitPrune({ collect }).catch(function kept(error: unknown) {
				failure = error
				return undefined
			})
		})
		.then(
			(prepared) => prepared.discard(),
			function keptPrepareFailure(error: unknown) {
				prepareFailure = error
			},
		)
	if (failure) throw failure
	if (!preview) throw prepareFailure ?? new Error('no preview')
	return { preview, labels }
}

/** A write moving each element, in order. */
function moving(moves: readonly Move[]): Write {
	return async function moveEach(tx) {
		for (const move of moves) await tx.any.move(move.element, { parent: move.parent })
		return {}
	}
}

/** Three behaviour variables of FB, written in this order: out of reach, without data, with both groups. */
async function writingIncoherentReferences(tx: Scl.Transaction): Promise<Record<string, string>> {
	const outOfReach = await tx.any.addChild(FUNCTION_BEHAVIOUR, {
		tagName: 'OutputVar',
		attributes: { varName: 'out', lnodeUuid: 'cswi', doName: 'Pos' },
	})
	const noData = await tx.any.addChild(FUNCTION_BEHAVIOUR, {
		tagName: 'InputVar',
		attributes: { varName: 'in', lnodeUuid: 'xcbr' },
	})
	const bothGroups = await tx.any.addChild(FUNCTION_BEHAVIOUR, {
		tagName: 'InputVar',
		attributes: { varName: 'both', lnodeUuid: 'ptrc', doName: 'Op', inputUuid: 'trip' },
	})
	return { 'out-of-reach': outOfReach.id, 'no-data': noData.id, 'both-groups': bothGroups.id }
}

/**
 * `<key> <code> <moved tag> <moved id> under <parent tag> <parent id>` or `<key> <code> <reference tag> <reference id>
 * <uuid attribute> <reason>`; a created reference's id is written `<label>`.
 */
function describeRefusal(params: {
	refusal: CommitRefusal
	labels: Record<string, string>
}): string {
	const { refusal, labels } = params
	if (refusal.key === 'MOVE_NOT_FOLLOWED') {
		const { moved, parent } = refusal.meta
		return `${refusal.key} ${refusal.code} ${moved.tagName} ${moved.id} under ${parent.tagName} ${parent.id}`
	}
	const { reference, uuidAttribute, reason } = refusal.meta
	const label = Object.entries(labels).find(([, id]) => id === reference.id)?.[0]
	const id = label ? `<${label}>` : reference.id
	return `${refusal.key} ${refusal.code} ${reference.tagName} ${id} ${uuidAttribute} ${reason}`
}

/** `<tag> <id> <effect> <reason>`. */
function describeRemoval(removal: CommitPrune['moves'][number]): string {
	return `${removal.element.tagName} ${removal.element.id} ${removal.effect} ${removal.reason}`
}
