import { planCommit } from './before-commit'
import severalRefusalsXml from './fixtures/commit-refusals-incoherent-references.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// commit-refusals-incoherent-references.xml: F1 holds the behaviour FB; F2 holds CSWI1, out of FB's reach. IED A: AP1 on
// N1 (CTRL sending PositionGoose; LD1 with DS1 and the data instance Op; LD2; LD4), AP2 connected nowhere. IED B: AP1.
const FUNCTION_BEHAVIOUR = { tagName: 'BehaviorDescription', id: 'fb' } as Scl.Ref<Scl.ElementsOf>

/** A move of the transaction. */
type Move = { element: string; id: string; parentTag: string; parentId: string }

const MOVES = {
	ctrlToUnconnectedAp2: {
		element: 'LDevice',
		id: 'ctrl',
		parentTag: 'Server',
		parentId: 'a-server2',
	},
	opToAnotherLn: { element: 'DOI', id: 'op', parentTag: 'LN', parentId: 'ld2-xcbr1' },
	ds1ToAnotherLd: { element: 'DataSet', id: 'ds1', parentTag: 'LN0', parentId: 'ld2-lln0' },
	ld4ToAnotherIed: { element: 'LDevice', id: 'ld4', parentTag: 'Server', parentId: 'b-server' },
	gse1ToAnotherIed: {
		element: 'GSE',
		id: 'gse1',
		parentTag: 'ConnectedAP',
		parentId: 'connected-ap-b',
	},
} as const satisfies Record<string, Move>

/** A refusal as the commit throws it, or as the preview lists it. */
type Refused = {
	key: string | undefined
	code: string | undefined
	meta: unknown
	detail: string | undefined
}

// The commit never collects: it refuses with the first refusal the collecting preview lists, the same key, code, meta
// and detail; the preview without `collect` throws that same one.
describe('the commit and the default preview refuse with the first refusal the collecting preview lists', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		write: (tx: Scl.Transaction) => Promise<void>
		/** The code the commit refuses with. */
		code: string
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'five moves of every family the commit does not follow → the first listed is the one thrown': {
			sourceXml: severalRefusalsXml,
			write: moving([
				MOVES.ctrlToUnconnectedAp2,
				MOVES.opToAnotherLn,
				MOVES.ds1ToAnotherLd,
				MOVES.ld4ToAnotherIed,
				MOVES.gse1ToAnotherIed,
			]),
			code: 'SCL4003',
		},
		// the unconnected address is judged first: listed last here, thrown first
		'the unconnected move written last → still the first listed and the one thrown': {
			sourceXml: severalRefusalsXml,
			write: moving([MOVES.gse1ToAnotherIed, MOVES.opToAnotherLn, MOVES.ctrlToUnconnectedAp2]),
			code: 'SCL4003',
		},
		'three uuid references written incoherently → the first listed is the one thrown': {
			sourceXml: severalRefusalsXml,
			// fixed record ids: the commit and each preview run their own transaction, and the refusals name the references
			write: async function writeIncoherentReferences(tx) {
				await tx.any.addChild(FUNCTION_BEHAVIOUR, {
					tagName: 'OutputVar',
					id: 'out-of-reach',
					attributes: { varName: 'out', lnodeUuid: 'cswi', doName: 'Pos' },
				})
				await tx.any.addChild(FUNCTION_BEHAVIOUR, {
					tagName: 'InputVar',
					id: 'no-data',
					attributes: { varName: 'in', lnodeUuid: 'xcbr' },
				})
				await tx.any.addChild(FUNCTION_BEHAVIOUR, {
					tagName: 'InputVar',
					id: 'both-groups',
					attributes: { varName: 'both', lnodeUuid: 'ptrc', doName: 'Op', inputUuid: 'trip' },
				})
			},
			code: 'SCL4004',
		},
		'a move the commit does not follow and an incoherent reference → the move listed first and thrown':
			{
				sourceXml: severalRefusalsXml,
				write: async function moveThenWrite(tx) {
					await moving([MOVES.opToAnotherLn])(tx)
					await tx.any.addChild(FUNCTION_BEHAVIOUR, {
						tagName: 'InputVar',
						attributes: { varName: 'in', lnodeUuid: 'xcbr' },
					})
				},
				code: 'SCL4003',
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const committed = await source.transaction(testCase.write).then(() => undefined, refusedOf)
		const defaultPreview = await previewWith({ source, write: testCase.write, collect: false })
		const firstListed = previewWith({ source, write: testCase.write, collect: true })
		await expect(
			firstListed.then((listed) => ({ code: committed?.code, defaultPreview, listed })),
		).resolves.toEqual({
			code: testCase.code,
			defaultPreview: committed,
			listed: committed,
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// In collect mode the commit goes on past a refused uuid reference without naming it: a reference out of reach is left
// without a path, one in reach keeps the path its create wrote.
describe('planCommit({ collect: true }) - a refused uuid reference gets no path, the others theirs', () => {
	type PathsCase = SclTest.BaseXmlTestCase & {
		write: (tx: Scl.Transaction) => Promise<void>
		/** The ids of the references left holding a `dataName` once the plan ran, in id order. */
		named: string[]
	}

	const testCases: SclTest.TestCases<PathsCase> = {
		// CSWI1 is in F2, out of FB's reach; XCBR1 is in SF1 of F1, in its reach; both written without their path
		'one variable out of reach and one in reach, both written without a path → only the one in reach named':
			{
				sourceXml: severalRefusalsXml,
				write: async function writeTwoVariables(tx) {
					await tx.any.addChild(FUNCTION_BEHAVIOUR, {
						tagName: 'OutputVar',
						id: 'out-of-reach',
						attributes: { varName: 'out', lnodeUuid: 'cswi', doName: 'Pos' },
					})
					await tx.any.addChild(FUNCTION_BEHAVIOUR, {
						tagName: 'OutputVar',
						id: 'in-reach',
						attributes: { varName: 'in', lnodeUuid: 'xcbr', doName: 'Pos', daName: 'stVal' },
					})
				},
				named: ['in-reach'],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<PathsCase>): Promise<void> {
		let named: string[] | undefined
		await source
			.prepare(async function writeThenPlan(tx) {
				await testCase.write(tx)
				const planned = await planCommit({
					operations: tx.getStagedOperations(),
					query: tx,
					collect: true,
				})
				// each record as the transaction and the plan leave it, the plan's writes last
				const left = new Map<string, Scl.RawRecord<Scl.ElementsOf>>()
				for (const operation of [...tx.getStagedOperations(), ...planned.staged]) {
					if (operation.status !== 'deleted') left.set(operation.newRecord.id, operation.newRecord)
				}
				named = ['out-of-reach', 'in-reach']
					.filter((id) =>
						left.get(id)?.attributes.some((attribute) => attribute.name === 'dataName'),
					)
					.sort()
			})
			.then(
				(prepared) => prepared.discard(),
				() => undefined,
			)
		expect(named).toEqual(testCase.named)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type Source = SclTest.ActParams<SclTest.BaseXmlTestCase>['source']

/**
 * The preview after `write`, the transaction discarded: without `collect`, the refusal it throws; with it, the first
 * refusal it lists.
 */
async function previewWith(params: {
	source: Source
	write: (tx: Scl.Transaction) => Promise<void>
	collect: boolean
}): Promise<Refused | undefined> {
	const { source, write, collect } = params
	let refused: Refused | undefined
	let failure: unknown
	await source
		.prepare(async function writeThenPreview(tx) {
			await write(tx)
			await tx.cleanUp.commitPrune({ collect }).then(
				function listed(preview) {
					const [first] = preview.refusals
					refused = first
						? { key: first.key, code: first.code, meta: first.meta, detail: first.detail }
						: undefined
				},
				function thrown(error: unknown) {
					if (collect) failure = error
					else refused = refusedOf(error)
				},
			)
		})
		.then(
			(prepared) => prepared.discard(),
			() => undefined,
		)
	if (failure) throw failure
	return refused
}

/** The key, code, meta and detail of a refusal thrown. */
function refusedOf(error: unknown): Refused {
	const dialecteError = toDialecteError(error)
	return {
		key: dialecteError?.key,
		code: dialecteError?.code,
		meta: dialecteError?.meta,
		detail: dialecteError?.detail,
	}
}

/** A write moving each element, in order. */
function moving(moves: readonly Move[]): (tx: Scl.Transaction) => Promise<void> {
	return async function moveEach(tx) {
		for (const move of moves) {
			await tx.any.move({ tagName: move.element, id: move.id } as Scl.Ref<Scl.ElementsOf>, {
				parent: { tagName: move.parentTag, id: move.parentId } as Scl.Ref<Scl.ElementsOf>,
			})
		}
	}
}
