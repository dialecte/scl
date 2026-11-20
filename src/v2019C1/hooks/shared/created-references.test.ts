import bayWithReferencesToComeXml from './fixtures/a-bay-with-references-to-a-function-and-a-node-to-come.xml?raw'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const TO_COME_REASON = 'the source names, by uuid, a node and a function the transaction creates'
const TO_COME = '00000000-0000-4000-8000-0000000000a1'
const NODE_TO_COME = '00000000-0000-4000-8000-0000000000c1'
const LATER = '00000000-0000-4000-8000-0000000000b1'

/**
 * Contract: the references of the elements a transaction creates hold, once it commits, the paths of the elements their
 * uuids name in the committed state, whatever the order of the writes: a target created before or after its
 * references, deleted, renamed, moved, or its ancestor renamed in the same transaction; two references of one uuid; one
 * uuid on two targets; a reference naming nothing; an empty project.
 */
describe('created references - the paths their targets give them, once committed', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** What the transaction writes. */
		write: (tx: Scl.Transaction) => Promise<unknown>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a function created that two stored references name → both hold its path': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			write: creatingFunction({ parent: 'b1', name: 'F2', uuid: TO_COME }),
			expectedQueries: [
				'//v2019C1:FunctionCategory[count(v2019C1:FunctionCatRef[@function="S1/VL1/B1/F2"])=2]',
			],
		},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a node created that a stored terminal names → the terminal holds its path and the names of its levels':
			{
				sourceXml: bayWithReferencesToComeXml,
				allowIncoherentReferences: TO_COME_REASON,
				write: creatingNode({ parent: 'b1', name: 'L1', uuid: NODE_TO_COME }),
				expectedQueries: [
					'//default:Terminal[@connectivityNode="S1/VL1/B1/L1" and @substationName="S1" and @voltageLevelName="VL1" and @bayName="B1" and @cNodeName="L1"]',
					'//default:ConnectivityNode[@name="L1" and @pathName="S1/VL1/B1/L1"]',
				],
			},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'one uuid created on a function then on a sub-function → the references hold the path of the last created':
			{
				sourceXml: bayWithReferencesToComeXml,
				allowIncoherentReferences: TO_COME_REASON,
				allowInvalidOutput: {
					reason: 'one uuid held by two elements on purpose',
					violations: [{ check: 'identity', code: 'duplicate-instance-uuid' }],
				},
				write: async function creatingTwoTargetsOfOneUuid(tx) {
					await creatingFunction({ parent: 'b2', name: 'F2', uuid: TO_COME })(tx)
					await tx.addChild(
						{ tagName: 'Function', id: 'f1' },
						{ tagName: 'SubFunction', attributes: { name: 'SF1', uuid: TO_COME } },
					)
				},
				expectedQueries: [
					'//v2019C1:FunctionCategory[count(v2019C1:FunctionCatRef[@function="S1/VL1/B1/F1/SF1"])=2]',
				],
			},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a reference created before the function its uuid names → it holds the path': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			write: async function referencingThenCreating(tx) {
				await creatingCategoryReference({ uuid: LATER })(tx)
				await creatingFunction({ parent: 'b2', name: 'F3', uuid: LATER })(tx)
			},
			expectedQueries: [
				`//v2019C1:FunctionCatRef[@functionUuid="${LATER}" and @function="S1/VL1/B2/F3"]`,
			],
		},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a reference created after the function its uuid names → it holds the path': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			write: async function creatingThenReferencing(tx) {
				await creatingFunction({ parent: 'b2', name: 'F3', uuid: LATER })(tx)
				await creatingCategoryReference({ uuid: LATER })(tx)
			},
			expectedQueries: [
				`//v2019C1:FunctionCatRef[@functionUuid="${LATER}" and @function="S1/VL1/B2/F3"]`,
			],
		},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a reference created naming nothing → left as given': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			allowInvalidOutput: {
				reason: 'the created reference names no element on purpose',
				violations: [{ check: 'references', code: 'dangling' }],
			},
			write: creatingCategoryReference({ uuid: '00000000-0000-4000-8000-0000000000e1' }),
			expectedQueries: [
				'//v2019C1:FunctionCatRef[@functionUuid="00000000-0000-4000-8000-0000000000e1" and not(@function)]',
			],
		},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a function created then deleted → its references as the delete leaves them': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			write: async function creatingThenDeleting(tx) {
				const created = await creatingFunction({ parent: 'b1', name: 'F2', uuid: TO_COME })(tx)
				await tx.delete(created)
			},
			expectedQueries: ['//default:Substation[not(.//v2019C1:FunctionCatRef)]'],
		},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a function created then one of its references deleted → the other holds its path': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			write: async function creatingThenDeletingAReference(tx) {
				await creatingFunction({ parent: 'b1', name: 'F2', uuid: TO_COME })(tx)
				await tx.delete({ tagName: 'FunctionCatRef', id: 'ref-a' })
			},
			expectedQueries: [
				'//v2019C1:FunctionCategory[count(v2019C1:FunctionCatRef)=1]',
				'//v2019C1:FunctionCatRef[@function="S1/VL1/B1/F2"]',
			],
		},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a function created then renamed → its references hold the new path': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			write: async function creatingThenRenaming(tx) {
				const created = await creatingFunction({ parent: 'b1', name: 'F2', uuid: TO_COME })(tx)
				await tx.update(created, { attributes: { name: 'F9' } })
			},
			expectedQueries: [
				'//v2019C1:FunctionCategory[count(v2019C1:FunctionCatRef[@function="S1/VL1/B1/F9"])=2]',
			],
		},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a function created then its bay renamed → its references hold the new path': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			write: async function creatingThenRenamingTheBay(tx) {
				await creatingFunction({ parent: 'b1', name: 'F2', uuid: TO_COME })(tx)
				await tx.update({ tagName: 'Bay', id: 'b1' }, { attributes: { name: 'B9' } })
			},
			expectedQueries: [
				'//v2019C1:FunctionCategory[count(v2019C1:FunctionCatRef[@function="S1/VL1/B9/F2"])=2]',
			],
		},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a function created then moved to another bay → its references hold the path at its new place':
			{
				sourceXml: bayWithReferencesToComeXml,
				allowIncoherentReferences: TO_COME_REASON,
				write: async function creatingThenMoving(tx) {
					const created = await creatingFunction({ parent: 'b1', name: 'F2', uuid: TO_COME })(tx)
					await tx.move(created, { parent: { tagName: 'Bay', id: 'b2' } })
				},
				expectedQueries: [
					'//v2019C1:FunctionCategory[count(v2019C1:FunctionCatRef[@function="S1/VL1/B2/F2"])=2]',
				],
			},
		'an empty project given a function and a reference to it in one transaction → the reference holds its path':
			{
				sourceXml: /* xml */ `<SCL ${ns} ${id}="root"/>`,
				write: async function buildingFromNothing(tx) {
					const substation = await tx.addChild(
						{ tagName: 'SCL', id: 'root' },
						{ tagName: 'Substation', attributes: { name: 'S1' } },
					)
					const category = await tx.addChild(substation, {
						tagName: 'FunctionCategory',
						attributes: { name: 'Cat1' },
					})
					await tx.addChild(category, {
						tagName: 'FunctionCatRef',
						attributes: { functionUuid: TO_COME },
					})
					await tx.addChild(substation, {
						tagName: 'Function',
						attributes: { name: 'F1', uuid: TO_COME },
					})
				},
				expectedQueries: [
					`//v2019C1:FunctionCatRef[@functionUuid="${TO_COME}" and @function="S1/F1"]`,
				],
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await source.transaction(testCase.write)
			return { assertOn: 'source' }
		},
	})
})

/**
 * Contract: nothing is held from one transaction to the next: a reference committed by one, its function created by a
 * second, holds the function's path.
 */
describe('created references - a target created in the transaction after the one that committed its reference', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a reference committed, then its function created in a second transaction → it holds the path':
			{
				sourceXml: bayWithReferencesToComeXml,
				allowIncoherentReferences: TO_COME_REASON,
				expectedQueries: [
					`//v2019C1:FunctionCatRef[@functionUuid="${LATER}" and @function="S1/VL1/B2/F3"]`,
				],
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			await source.transaction(creatingCategoryReference({ uuid: LATER }))
			await source.transaction(creatingFunction({ parent: 'b2', name: 'F3', uuid: LATER }))
			return { assertOn: 'source' }
		},
	})
})

/** A write creating a function with a uuid under a bay; it answers the function created. */
function creatingFunction(params: {
	parent: string
	name: string
	uuid: string
}): (tx: Scl.Transaction) => Promise<Scl.Ref<'Function'>> {
	const { parent, name, uuid } = params
	return async function createFunction(tx) {
		const created = await tx.addChild(
			{ tagName: 'Bay', id: parent },
			{ tagName: 'Function', attributes: { name, uuid } },
		)
		return { tagName: 'Function', id: created.id }
	}
}

/** A write creating a connectivity node with a uuid under a bay, its path left to the hooks. */
function creatingNode(params: {
	parent: string
	name: string
	uuid: string
}): (tx: Scl.Transaction) => Promise<void> {
	const { parent, name, uuid } = params
	return async function createNode(tx) {
		await tx.addChild(
			{ tagName: 'Bay', id: parent },
			// the hooks write the node's pathName: the case gives none
			{ tagName: 'ConnectivityNode', attributes: { name, uuid } as never },
		)
	}
}

/** A write creating a function category reference naming a uuid. */
function creatingCategoryReference(params: {
	uuid: string
}): (tx: Scl.Transaction) => Promise<void> {
	return async function createCategoryReference(tx) {
		await tx.addChild(
			{ tagName: 'FunctionCategory', id: 'cat1' },
			{ tagName: 'FunctionCatRef', attributes: { functionUuid: params.uuid } },
		)
	}
}
