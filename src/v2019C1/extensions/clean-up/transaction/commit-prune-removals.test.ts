import categoryAndVariableXml from '../../../hooks/before-commit/fixtures/a-category-and-a-variable-named-by-an-application.xml?raw'
import twoGooseDataSetsXml from '../../../hooks/before-commit/fixtures/commit-plan-two-goose-data-sets-of-one-entry.xml?raw'
import lnodesBoundToADeviceXml from '../../../hooks/before-commit/fixtures/lnodes-bound-to-a-device.xml?raw'
import twoSubstationsAndALineXml from '../../../hooks/before-commit/fixtures/two-substations-and-a-line.xml?raw'
import logicalNodeWithOwnTypeXml from './fixtures/commit-prune-a-logical-node-with-its-own-type.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CommitPrune } from './commit-prune.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** A transaction deleting each element in turn. */
function deleting(
	refs: readonly Scl.Ref<Scl.ElementsOf>[],
): (tx: Scl.Transaction) => Promise<void> {
	return async function deleteEach(tx) {
		for (const ref of refs) await tx.delete(ref)
	}
}

// The preview names what the commit removes beside the containers and the types: what its moves remove, and the LNodes
// it releases.
describe('tx.cleanUp.commitPrune - what the moves remove and the LNodes released', () => {
	type RemovalCase = SclTest.BaseXmlTestCase & {
		write: (tx: Scl.Transaction) => Promise<void>
		moves: string[]
		released: string[]
	}

	const testCases: SclTest.TestCases<RemovalCase> = {
		// QA1 leaves S1 for S2: its terminal names L1, which stays in S1
		'QA1 moved to another substation → the preview names the terminal its move removes': {
			sourceXml: twoSubstationsAndALineXml,
			write: async function moveTheBreaker(tx) {
				await tx.any.move(
					{ tagName: 'ConductingEquipment', id: 'qa1' },
					{ parent: { tagName: 'Bay', id: 'b5' } },
				)
			},
			moves: ['Terminal t-inner - deleted, terminal-across-containers'],
			released: [],
		},
		// the breaker LNode is bound to P1's Q0XCBR2 and specified on S_IED's XCBR1, which the document still holds
		"P1's breaker deleted → the preview names the LNode the commit releases": {
			sourceXml: lnodesBoundToADeviceXml,
			write: async function deleteTheLogicalNode(tx) {
				await tx.delete({ tagName: 'LN', id: 'p1-breaker' })
			},
			moves: [],
			released: ['LNode breaker breaker-uuid: P1 → S_IED'],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<RemovalCase>): Promise<void> {
		const preview = await previewAfter({ source, write: testCase.write })
		expect({
			moves: preview.moves.map(
				(removal) =>
					`${removal.element.tagName} ${removal.element.id} - ${removal.effect}, ${removal.reason}`,
			),
			released: preview.released.map(
				(release) =>
					`${release.element.tagName} ${release.element.id} ${release.identity.uuid ?? '-'}: ${release.from.iedName ?? '-'} → ${release.to.iedName ?? '-'}`,
			),
		}).toEqual({ moves: testCase.moves, released: testCase.released })
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The preview and the commit are one plan: every record the commit deletes beyond the transaction's own operations is
// named once by the preview - a container, a record it holds, a type, a record a type holds, something that goes with
// a container outside it, an element the moves remove, or a record either of those takes with it - and the preview
// names nothing the commit keeps.
describe('tx.cleanUp.commitPrune - the preview lists exactly what the commit removes', () => {
	type ParityCase = SclTest.BaseXmlTestCase & { write: (tx: Scl.Transaction) => Promise<void> }

	const testCases: SclTest.TestCases<ParityCase> = {
		// the category and the variable are pruned, and the application's references to them go outside them
		'the function a category and a variable name deleted': {
			sourceXml: categoryAndVariableXml,
			write: deleting([{ tagName: 'Function', id: 'f1' }]),
		},
		// the only IED deleted: every type is left unused and the DataTypeTemplates is emptied
		'the only IED deleted': {
			sourceXml: logicalNodeWithOwnTypeXml,
			write: deleting([{ tagName: 'IED', id: 'ied1' }]),
		},
		// a move whose commit removes a terminal across containers
		'a breaker moved to another substation': {
			sourceXml: twoSubstationsAndALineXml,
			write: async function moveTheBreaker(tx) {
				await tx.any.move(
					{ tagName: 'ConductingEquipment', id: 'qa1' },
					{ parent: { tagName: 'Bay', id: 'b5' } },
				)
			},
		},
		// the last entry of a data set: the data set goes and its control block is cleared, not removed
		'the only entry of DS1 deleted': {
			sourceXml: twoGooseDataSetsXml,
			write: deleting([{ tagName: 'FCDA', id: 'ds1-entry' }]),
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ParityCase>): Promise<void> {
		await expect(previewAgainstCommit({ source, write: testCase.write })).resolves.toEqual({
			notNamed: [],
			namedButKept: [],
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/**
 * What the commit deletes beyond the transaction's own operations but the preview does not name (`notNamed`), and what
 * the preview names as removed although the commit keeps it (`namedButKept`).
 */
async function previewAgainstCommit(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
	write: (tx: Scl.Transaction) => Promise<void>
}): Promise<{ notNamed: string[]; namedButKept: string[] }> {
	const { source, write } = params
	let preview: CommitPrune | undefined
	let own = 0
	const prepared = await source.prepare(async function writeThenPreview(tx) {
		await write(tx)
		own = tx.getStagedOperations().length
		preview = await tx.cleanUp.commitPrune()
	})
	const committed = prepared.operations.slice(own)
	prepared.discard()
	if (!preview) throw new Error('no preview')
	const deleted = new Set(
		committed.flatMap((operation) =>
			operation.status === 'deleted' ? [operation.oldRecord.id] : [],
		),
	)
	const named = new Set<string>([
		...preview.containers.flatMap((container) => [
			container.element.id,
			...container.holds.map((record) => record.id),
		]),
		...preview.types.flatMap((type) => [type.element.id, ...type.holds.map((record) => record.id)]),
		...preview.containers.flatMap((container) =>
			container.goesWith.flatMap((effect) =>
				effect.effect === 'deleted'
					? [effect.element.id, ...effect.holds.map((record) => record.id)]
					: [],
			),
		),
		...preview.moves.flatMap((removal) =>
			removal.effect === 'deleted'
				? [removal.element.id, ...removal.holds.map((record) => record.id)]
				: [],
		),
	])
	return {
		notNamed: [...deleted].filter((id) => !named.has(id)).sort(),
		namedButKept: [...named].filter((id) => !deleted.has(id)).sort(),
	}
}

/** The preview of the commit after `write`; the transaction discarded. */
async function previewAfter(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
	write: (tx: Scl.Transaction) => Promise<void>
}): Promise<CommitPrune> {
	let preview: CommitPrune | undefined
	const prepared = await params.source.prepare(async function writeThenPreview(tx) {
		await params.write(tx)
		preview = await tx.cleanUp.commitPrune()
	})
	prepared.discard()
	if (!preview) throw new Error('no preview')
	return preview
}
