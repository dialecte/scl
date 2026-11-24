import behaviours from './fixtures/uuid-references/behaviours.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// behaviours.xml: F1 holds the behaviour FB, the LNode PTRC1 (behaviour LB, input Trip, control CTL1) and SF1 holding
// XCBR1 (control CTL2); F2 holds CSWI1
const FUNCTION_BEHAVIOUR = { tagName: 'BehaviorDescription', id: 'fb' } as Scl.Ref<Scl.ElementsOf>
const LNODE_BEHAVIOUR = { tagName: 'BehaviorDescription', id: 'lb' } as Scl.Ref<Scl.ElementsOf>
const PTRC_INPUTS = { tagName: 'LNodeInputs', id: 'ptrc-inputs' } as Scl.Ref<Scl.ElementsOf>
const XCBR_OUTPUTS = { tagName: 'LNodeOutputs', id: 'xcbr-outputs' } as Scl.Ref<Scl.ElementsOf>
const STORED_DATA = { tagName: 'OutputVar', id: 'stored-data' } as Scl.Ref<Scl.ElementsOf>
const SUB_FUNCTION = { tagName: 'SubFunction', id: 'sf1' } as Scl.Ref<Scl.ElementsOf>

/** The reference a refusal names. */
type WrittenReference = { tagName: string; id: string }
const XCBR = { tagName: 'LNode', id: 'xcbr' } as Scl.Ref<Scl.ElementsOf>
const PTRC = { tagName: 'LNode', id: 'ptrc' } as Scl.Ref<Scl.ElementsOf>

describe('the commit refuses a uuid reference it cannot name coherently', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The transaction's writes; answers the reference the refusal names. */
		write: (tx: Scl.Transaction) => Promise<WrittenReference>
		expected: { reason: string; uuidAttribute: string }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// FB sits in F1; CSWI1 sits in F2, out of FB's reach
		'OutputVar of a Function behaviour naming an LNode of another Function by its uuid → refused out-of-scope':
			{
				sourceXml: behaviours,
				write: async function addOutputOnAnotherFunction(tx) {
					const created = await tx.any.addChild(FUNCTION_BEHAVIOUR, {
						tagName: 'OutputVar',
						attributes: { varName: 'out', lnodeUuid: 'cswi', doName: 'Pos' },
					})
					return { tagName: created.tagName, id: created.id }
				},
				expected: { reason: 'out-of-scope', uuidAttribute: 'lnodeUuid' },
			},
		// LB sits in PTRC1; CTL2 is XCBR1's control
		'OutputVar of an LNode behaviour naming a ControlRef of another LNode → refused out-of-scope': {
			sourceXml: behaviours,
			write: async function addOutputOnAnotherLNode(tx) {
				const created = await tx.any.addChild(LNODE_BEHAVIOUR, {
					tagName: 'OutputVar',
					attributes: { varName: 'out', outputUuid: 'ctl2' },
				})
				return { tagName: created.tagName, id: created.id }
			},
			expected: { reason: 'out-of-scope', uuidAttribute: 'outputUuid' },
		},
		// FB reaches XCBR1; the variable gives no doName
		'InputVar created with its LNode uuid and no data object → refused data-missing': {
			sourceXml: behaviours,
			write: async function addInputWithoutData(tx) {
				const created = await tx.any.addChild(FUNCTION_BEHAVIOUR, {
					tagName: 'InputVar',
					attributes: { varName: 'in', lnodeUuid: 'xcbr' },
				})
				return { tagName: created.tagName, id: created.id }
			},
			expected: { reason: 'data-missing', uuidAttribute: 'lnodeUuid' },
		},
		// PTRC1's inputs; the input names XCBR1 with no sourceDoName
		'SourceRef created with its LNode uuid and no data object → refused data-missing': {
			sourceXml: behaviours,
			write: async function addSourceWithoutData(tx) {
				const created = await tx.any.addChild(PTRC_INPUTS, {
					tagName: 'SourceRef',
					attributes: { input: 'Block', sourceLNodeUuid: 'xcbr' },
				})
				return { tagName: created.tagName, id: created.id }
			},
			expected: { reason: 'data-missing', uuidAttribute: 'sourceLNodeUuid' },
		},
		// XCBR1's outputs; the control names PTRC1 with no controlledDoName
		'ControlRef created with the uuid of the LNode it controls and no data object → refused data-missing':
			{
				sourceXml: behaviours,
				write: async function addControlWithoutData(tx) {
					const created = await tx.any.addChild(XCBR_OUTPUTS, {
						tagName: 'ControlRef',
						attributes: { output: 'CTL3', controlledLNodeUuid: 'ptrc' },
					})
					return { tagName: created.tagName, id: created.id }
				},
				expected: { reason: 'data-missing', uuidAttribute: 'controlledLNodeUuid' },
			},
		// stored-data names XCBR1's Pos.stVal; its doName and daName removed
		'a stored variable whose data object is removed, its uuid kept → refused data-missing': {
			sourceXml: behaviours,
			write: async function removeDataObject(tx) {
				// `update` removes an attribute given `undefined`; the untyped surface takes string values only
				await tx.any.update(STORED_DATA, {
					attributes: { doName: undefined, daName: undefined } as unknown as Record<string, string>,
				})
				return { tagName: 'OutputVar', id: 'stored-data' }
			},
			expected: { reason: 'data-missing', uuidAttribute: 'lnodeUuid' },
		},
		// FB; the variable names PTRC1's Op and the input Trip
		'a behaviour variable created with both groups → refused groups-together': {
			sourceXml: behaviours,
			write: async function addInputWithBothGroups(tx) {
				const created = await tx.any.addChild(FUNCTION_BEHAVIOUR, {
					tagName: 'InputVar',
					attributes: { varName: 'in', lnodeUuid: 'ptrc', doName: 'Op', inputUuid: 'trip' },
				})
				return { tagName: created.tagName, id: created.id }
			},
			expected: { reason: 'groups-together', uuidAttribute: 'inputUuid' },
		},
		// stored-data names XCBR1's data; it is given the control CTL2
		'a stored variable given the other group → refused groups-together': {
			sourceXml: behaviours,
			write: async function addControlToDataVariable(tx) {
				await tx.any.update(STORED_DATA, { attributes: { outputUuid: 'ctl2' } })
				return { tagName: 'OutputVar', id: 'stored-data' }
			},
			expected: { reason: 'groups-together', uuidAttribute: 'outputUuid' },
		},
		// FB holds stored-no-do (XCBR1 by uuid, no doName); FB copied into F1
		'a copy of the Function behaviour holding a stored variable with no data object → refused data-missing':
			{
				sourceXml: behaviours,
				write: async function copyBehaviour(tx) {
					const tree = await tx.getTree(FUNCTION_BEHAVIOUR)
					const copy = await tx.deepClone(
						{ tagName: 'Private', id: 'f1-private' } as Scl.Ref<Scl.ElementsOf>,
						tree as Scl.TreeRecord<'BehaviorDescription'>,
					)
					const copied = await tx.getChildren(copy.record, 'InputVar')
					const noDataObject = copied.find((record) =>
						record.attributes.some((attribute) => attribute.value === 'noDo'),
					)
					if (!noDataObject) throw new Error('the copy holds no copy of stored-no-do')
					return { tagName: noDataObject.tagName, id: noDataObject.id }
				},
				expected: { reason: 'data-missing', uuidAttribute: 'lnodeUuid' },
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		let reference: WrittenReference | undefined
		const refused = await source
			.transaction(async function writeReference(tx) {
				reference = await testCase.write(tx)
			})
			.then(function committed() {
				return undefined
			})
			.catch(function refusal(error: unknown) {
				const dialecteError = toDialecteError(error)
				return { key: dialecteError?.key, meta: dialecteError?.meta }
			})
		expect(refused).toEqual({
			key: 'REFERENCE_INCOHERENT',
			meta: {
				reference: { tagName: reference?.tagName, id: reference?.id },
				uuidAttribute: testCase.expected.uuidAttribute,
				reason: testCase.expected.reason,
			},
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('the commit keeps a uuid reference it can name, and the stored references a transaction does not write', () => {
	type TestCase = SclTest.BaseXmlTestCase & { write: (tx: Scl.Transaction) => Promise<void> }

	const testCases: SclTest.TestCases<TestCase> = {
		// FB sits in F1; XCBR1 sits in F1's SF1
		'OutputVar of a Function behaviour naming an LNode below the Function → committed with its local path':
			{
				sourceXml: behaviours,
				write: async function addOutputBelow(tx) {
					await tx.any.addChild(FUNCTION_BEHAVIOUR, {
						tagName: 'OutputVar',
						attributes: { varName: 'out', lnodeUuid: 'xcbr', doName: 'Pos', daName: 'stVal' },
					})
				},
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="out"][@dataName="SF1/XCBR1.Pos.stVal"][@lnodeUuid="xcbr"]',
				],
			},
		// LB sits in PTRC1, which it names
		'InputVar of an LNode behaviour naming its own data → committed with its local path': {
			sourceXml: behaviours,
			write: async function addInputOnOwnLNode(tx) {
				await tx.any.addChild(LNODE_BEHAVIOUR, {
					tagName: 'InputVar',
					attributes: { varName: 'in', lnodeUuid: 'ptrc', doName: 'Op' },
				})
			},
			expectedQueries: ['//v2019C1:InputVar[@varName="in"][@dataName="Op"][@lnodeUuid="ptrc"]'],
		},
		// FB; GGIO1 created in SF1 after the variable naming it
		'a variable created before the LNode it names, in one transaction → committed with its local path':
			{
				sourceXml: behaviours,
				write: async function addOutputThenLNode(tx) {
					await tx.any.addChild(FUNCTION_BEHAVIOUR, {
						tagName: 'OutputVar',
						attributes: { varName: 'out', lnodeUuid: 'ggio', doName: 'Pos' },
					})
					await tx.any.addChild(SUB_FUNCTION, {
						tagName: 'LNode',
						attributes: { iedName: 'None', lnClass: 'GGIO', lnInst: '1', uuid: 'ggio' },
					})
				},
				expectedQueries: ['//v2019C1:OutputVar[@varName="out"][@dataName="SF1/GGIO1.Pos"]'],
			},
		// SF1 holds XCBR1, named by stored-data and stored-no-do
		'the sub-function holding stored variables renamed → committed, the stored variables followed':
			{
				sourceXml: behaviours,
				write: async function renameSubFunction(tx) {
					await tx.any.update(SUB_FUNCTION, { attributes: { name: 'SF9' } })
				},
				expectedQueries: [
					'//v2019C1:InputVar[@varName="noDo"][@dataName="SF9/XCBR1"][@lnodeUuid="xcbr"]',
					'//v2019C1:OutputVar[@varName="data"][@dataName="SF9/XCBR1.Pos.stVal"]',
				],
			},
		// XCBR1, named by stored-data and stored-no-do, deleted: the orphan cleanup clears their references
		'an LNode named by stored variables deleted → committed, their references cleared': {
			sourceXml: behaviours,
			write: async function deleteNamedLNode(tx) {
				await tx.any.delete(XCBR)
			},
			expectedQueries: [
				'//v2019C1:OutputVar[@varName="data"]',
				'//v2019C1:InputVar[@varName="both"][@inputUuid="trip"][@lnodeUuid="ptrc"]',
			],
			unexpectedQueries: [
				'//v2019C1:OutputVar[@varName="data"][@lnodeUuid]',
				'//v2019C1:InputVar[@varName="noDo"][@lnodeUuid]',
			],
		},
		// PTRC1, named by stored-both's two groups, given another instance: its paths follow
		'the LNode named by a stored variable holding both groups renamed → committed, its paths followed':
			{
				sourceXml: behaviours,
				write: async function renameNamedLNode(tx) {
					await tx.any.update(PTRC, { attributes: { lnInst: '2' } })
				},
				expectedQueries: [
					'//v2019C1:InputVar[@varName="both"][@dataName="PTRC2.Op.general"][@inputName="PTRC2.Trip"]',
				],
			},
		// stored-data names XCBR1's Pos.stVal; its path removed, uuid and data names kept by the caller
		'a stored variable whose path is cleared, its uuid kept → committed, the variable unbound': {
			sourceXml: behaviours,
			write: async function clearPath(tx) {
				// `update` removes an attribute given `undefined`; the untyped surface takes string values only
				await tx.any.update(STORED_DATA, {
					attributes: { daName: 'q', dataName: undefined } as unknown as Record<string, string>,
				})
			},
			expectedQueries: ['//v2019C1:OutputVar[@varName="data"]'],
			unexpectedQueries: [
				'//v2019C1:OutputVar[@varName="data"][@lnodeUuid]',
				'//v2019C1:OutputVar[@varName="data"][@dataName]',
			],
		},
		// stored-data given PTRC1 (in FB's reach) and its path removed in the same update
		'a stored variable given a new uuid with its path cleared → committed, its path written from the uuid':
			{
				sourceXml: behaviours,
				write: async function retargetWithoutPath(tx) {
					await tx.any.update(STORED_DATA, {
						attributes: {
							lnodeUuid: 'ptrc',
							doName: 'Op',
							daName: 'general',
							dataName: undefined,
						} as unknown as Record<string, string>,
					})
				},
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="data"][@lnodeUuid="ptrc"][@dataName="PTRC1.Op.general"]',
				],
			},
		// FB; a variable created naming XCBR1 with an empty path
		'a variable created with an empty path → committed, its path written': {
			sourceXml: behaviours,
			write: async function addWithEmptyPath(tx) {
				await tx.any.addChild(FUNCTION_BEHAVIOUR, {
					tagName: 'OutputVar',
					attributes: { varName: 'out', lnodeUuid: 'xcbr', doName: 'Pos', dataName: '' },
				})
			},
			expectedQueries: ['//v2019C1:OutputVar[@varName="out"][@dataName="SF1/XCBR1.Pos"]'],
		},
		// FB gets a variable naming CSWI1 of F2 (out of reach), then F1's Private holding FB moves into F2
		'a variable written out of reach, its behaviour then moved into reach → committed with its local path':
			{
				sourceXml: behaviours,
				write: async function addThenMoveIntoReach(tx) {
					await tx.any.addChild(FUNCTION_BEHAVIOUR, {
						tagName: 'OutputVar',
						attributes: { varName: 'out', lnodeUuid: 'cswi', doName: 'Pos' },
					})
					await tx.move(
						{ tagName: 'Private', id: 'f1-private' },
						{ parent: { tagName: 'Function', id: 'f2' } },
					)
				},
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="out"][@lnodeUuid="cswi"][@dataName="CSWI1.Pos"]',
				],
			},
		// XCBR1 moved to F2: stored-data and stored-no-do, of F1's FB, lose it from their reach
		'the LNode named by stored variables moved out of their reach → committed, the variables unbound':
			{
				sourceXml: behaviours,
				write: async function moveNamedLNode(tx) {
					await tx.move(
						{ tagName: 'LNode', id: 'xcbr' },
						{ parent: { tagName: 'Function', id: 'f2' } },
					)
				},
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="data"]',
					'//default:Function[@name="F2"]/default:LNode[@lnClass="XCBR"]',
				],
				unexpectedQueries: [
					'//v2019C1:OutputVar[@varName="data"][@lnodeUuid]',
					'//v2019C1:InputVar[@varName="noDo"][@lnodeUuid]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const outcome = await source
			.transaction(async function writeReferences(tx) {
				await testCase.write(tx)
			})
			.then(
				function committed() {
					return 'committed'
				},
				function refused(error: unknown) {
					return toDialecteError(error)?.key ?? String(error)
				},
			)
		expect(outcome).toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
