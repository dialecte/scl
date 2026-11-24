import behaviours from './fixtures/uuid-references/behaviours.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// behaviours.xml: F1 holds the behaviour FB (stored-data names XCBR1's Pos.stVal), the LNode PTRC1 (inputs,
// behaviour LB)
// and SF1 holding XCBR1; no element of the document holds the uuid "ghost"
const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const FUNCTION_BEHAVIOUR = { tagName: 'BehaviorDescription', id: 'fb' } as Scl.Ref<Scl.ElementsOf>
const PTRC_INPUTS = { tagName: 'LNodeInputs', id: 'ptrc-inputs' } as Scl.Ref<Scl.ElementsOf>
const SUB_FUNCTION = { tagName: 'SubFunction', id: 'sf1' } as Scl.Ref<Scl.ElementsOf>
const STORED_DATA = { tagName: 'OutputVar', id: 'stored-data' } as Scl.Ref<Scl.ElementsOf>
const STORED_CONTROL = { tagName: 'OutputVar', id: 'stored-control' } as Scl.Ref<Scl.ElementsOf>

describe('the commit refuses a reference given a uuid that names no element', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The transaction's writes; answers the reference the commit is about. */
		write: (tx: Scl.Transaction) => Promise<{ tagName: string; id: string }>
		/** The refusal's meta. */
		expected: { uuidAttribute: string; reason: string }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// stored-data names XCBR1; it is given "ghost"
		'a stored reference given a uuid naming nothing → refused uuid-unresolved': {
			sourceXml: behaviours,
			write: async function retargetToNothing(tx) {
				await tx.any.update(STORED_DATA, { attributes: { lnodeUuid: 'ghost' } })
				return { tagName: 'OutputVar', id: 'stored-data' }
			},
			expected: { uuidAttribute: 'lnodeUuid', reason: 'uuid-unresolved' },
		},
		// stored-control names CTL2 by its uuid; it is given "ghost"
		'a stored control output given a uuid naming nothing → refused uuid-unresolved': {
			sourceXml: behaviours,
			write: async function retargetControlToNothing(tx) {
				await tx.any.update(STORED_CONTROL, { attributes: { outputUuid: 'ghost' } })
				return { tagName: 'OutputVar', id: 'stored-control' }
			},
			expected: { uuidAttribute: 'outputUuid', reason: 'uuid-unresolved' },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		let reference: { tagName: string; id: string } | undefined
		const outcome = await source
			.transaction(async function writeReference(tx) {
				reference = await testCase.write(tx)
			})
			.then(
				function committed() {
					return 'committed'
				},
				function refused(error: unknown) {
					const refusal = toDialecteError(error)
					return { key: refusal?.key, meta: refusal?.meta }
				},
			)
		expect(outcome).toEqual({
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

describe('the commit keeps a uuid reference it creates, its element held or not', () => {
	type TestCase = SclTest.BaseXmlTestCase & { write: (tx: Scl.Transaction) => Promise<void> }

	const testCases: SclTest.TestCases<TestCase> = {
		// FB; the variable names the uuid "ghost", which no LNode holds: a create, as a copy keeps another document's uuids
		'a behaviour variable created with a uuid naming nothing → committed': {
			sourceXml: behaviours,
			allowInvalidOutput: {
				reason:
					'the variable names an element no document of the project holds, as a copy from another document does',
				violations: [{ check: 'references', code: 'dangling' }],
			},
			write: async function addVariableNamingNothing(tx) {
				await tx.any.addChild(FUNCTION_BEHAVIOUR, {
					tagName: 'OutputVar',
					attributes: { varName: 'out', lnodeUuid: 'ghost', doName: 'Pos' },
				})
			},
			expectedQueries: ['//v2019C1:OutputVar[@varName="out"][@lnodeUuid="ghost"]'],
		},
		// PTRC1's inputs; the input names the LNode "ghost" with its data object
		'an input created with an LNode uuid naming nothing → committed': {
			sourceXml: behaviours,
			allowInvalidOutput: {
				reason:
					'the input names an element no document of the project holds, as a copy from another document does',
				violations: [{ check: 'references', code: 'dangling' }],
			},
			write: async function addInputNamingNothing(tx) {
				await tx.any.addChild(PTRC_INPUTS, {
					tagName: 'SourceRef',
					attributes: { input: 'Block', sourceLNodeUuid: 'ghost', sourceDoName: 'Pos' },
				})
			},
			expectedQueries: ['//v2019C1:SourceRef[@input="Block"][@sourceLNodeUuid="ghost"]'],
		},
		// stored-data retargeted to "ghost", then SF1 gets an LNode holding "ghost" in the same transaction
		'a stored reference retargeted to an element the transaction creates → committed': {
			sourceXml: behaviours,
			write: async function retargetToCreated(tx) {
				await tx.any.update(STORED_DATA, { attributes: { lnodeUuid: 'ghost' } })
				await tx.any.addChild(SUB_FUNCTION, {
					tagName: 'LNode',
					attributes: { iedName: 'None', lnClass: 'GGIO', lnInst: '1', uuid: 'ghost' },
				})
			},
			expectedQueries: [
				'//v2019C1:OutputVar[@varName="data"][@lnodeUuid="ghost"][@dataName="SF1/GGIO1.Pos.stVal"]',
			],
		},
		// the stored variable names the uuid "ghost", which no LNode holds; only its data object is edited
		'a stored reference naming nothing whose data names change → committed': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<Private type="eIEC61850-6-100" ${id}="f1-private">
								<eIEC61850-6-100:BehaviorDescription name="FB" ${id}="fb">
									<eIEC61850-6-100:OutputVar varName="dangling" lnodeUuid="ghost" doName="Pos" ${id}="dangling"/>
								</eIEC61850-6-100:BehaviorDescription>
							</Private>
						</Function>
					</Substation>
				</SCL>
			`,
			allowIncoherentReferences:
				'the stored variable names an element no document holds, as data written before the check',
			write: async function editDataObject(tx) {
				await tx.any.update({ tagName: 'OutputVar', id: 'dangling' } as Scl.Ref<Scl.ElementsOf>, {
					attributes: { doName: 'Op' },
				})
			},
			expectedQueries: [
				'//v2019C1:OutputVar[@varName="dangling"][@lnodeUuid="ghost"][@doName="Op"]',
			],
		},
		// FB; the variable names "ghost", then SF1 gets an LNode holding "ghost" in the same transaction
		'a reference created before the element its uuid names, in one transaction → committed': {
			sourceXml: behaviours,
			write: async function addVariableThenItsLNode(tx) {
				await tx.any.addChild(FUNCTION_BEHAVIOUR, {
					tagName: 'OutputVar',
					attributes: { varName: 'out', lnodeUuid: 'ghost', doName: 'Pos' },
				})
				await tx.any.addChild(SUB_FUNCTION, {
					tagName: 'LNode',
					attributes: { iedName: 'None', lnClass: 'GGIO', lnInst: '1', uuid: 'ghost' },
				})
			},
			expectedQueries: [
				'//v2019C1:OutputVar[@varName="out"][@lnodeUuid="ghost"][@dataName="SF1/GGIO1.Pos"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function writeReferences(tx) {
			await testCase.write(tx)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
