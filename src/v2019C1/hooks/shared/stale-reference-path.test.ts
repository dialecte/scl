import behaviours from './fixtures/stale-reference-path/behaviours.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { resolveReferencePath } from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path'
import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// behaviours.xml: F1 holds FB (data → XCBR1's Pos.stVal, control → CTL2, both by path and uuid), PTRC1 (LB, CTL1) and
// SF1 holding XCBR1 (CTL2); F2 holds CSWI1 and F2B, whose pathless variable names XCBR1 (out of its reach)
const DATA = { tagName: 'OutputVar', id: 'data' } as Scl.Ref<Scl.ElementsOf>
const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('the path a reference holds always names the element its uuid names', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		write: (tx: Scl.Transaction) => Promise<void>
		/** How the commit ends: `committed`, or the refusal's key and reason (`KEY reason`). */
		outcome: string
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// data gets CSWI1 of F2, out of FB's reach, its path left as it was
		'a behaviour variable given the uuid of an LNode out of its reach, its path kept → refused out-of-scope':
			{
				sourceXml: behaviours,
				write: async function retargetOutOfReach(tx) {
					await tx.any.update(DATA, { attributes: { lnodeUuid: 'cswi' } })
				},
				outcome: 'REFERENCE_INCOHERENT out-of-scope',
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="data"][@lnodeUuid="xcbr"][@dataName="SF1/XCBR1.Pos.stVal"]',
				],
			},
		// data gets CSWI1 of F2, then F1's Private holding FB moves into F2: CSWI1 is then in reach
		'a variable retargeted out of reach, then its behaviour moved into reach → committed with the new LNode path':
			{
				sourceXml: behaviours,
				write: async function retargetThenMove(tx) {
					await tx.any.update(DATA, { attributes: { lnodeUuid: 'cswi' } })
					await tx.move(
						{ tagName: 'Private', id: 'f1-private' },
						{ parent: { tagName: 'Function', id: 'f2' } },
					)
				},
				outcome: 'committed',
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="data"][@lnodeUuid="cswi"][@dataName="CSWI1.Pos.stVal"]',
				],
			},
		// FB copied into PTRC1: its copied variables name XCBR1 and CTL2, out of PTRC1's reach
		'a copy whose copied path cannot be written from its uuid → refused out-of-scope': {
			sourceXml: behaviours,
			write: async function copyIntoAnotherLevel(tx) {
				const tree = await tx.getTree({ tagName: 'BehaviorDescription', id: 'fb' })
				const copy = await tx.deepClone(
					{ tagName: 'Private', id: 'ptrc-private' } as Scl.Ref<Scl.ElementsOf>,
					tree as Scl.TreeRecord<'BehaviorDescription'>,
				)
				await tx.any.update(copy.record, { attributes: { name: 'FB2' } })
			},
			outcome: 'REFERENCE_INCOHERENT out-of-scope',
			unexpectedQueries: ['//v2019C1:BehaviorDescription[@name="FB2"]'],
		},
		// F1's Private holding FB moved into SF1: XCBR1 is still in reach, one level closer
		'a behaviour moved one level down, its variables still in reach → their local paths written again':
			{
				sourceXml: behaviours,
				write: async function moveBehaviourDown(tx) {
					await tx.move(
						{ tagName: 'Private', id: 'f1-private' },
						{ parent: { tagName: 'SubFunction', id: 'sf1' } },
					)
				},
				outcome: 'committed',
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="data"][@lnodeUuid="xcbr"][@dataName="XCBR1.Pos.stVal"]',
					'//v2019C1:OutputVar[@varName="control"][@outputUuid="ctl2"][@outputName="XCBR1.CTL2"]',
				],
			},
		// F2's Private holding F2B moved into F1: XCBR1 comes in reach of F2B's pathless variable
		'a behaviour holding a pathless variable moved into its LNode reach → its path written': {
			sourceXml: behaviours,
			write: async function moveBehaviourIntoReach(tx) {
				await tx.move(
					{ tagName: 'Private', id: 'f2-private' },
					{ parent: { tagName: 'Function', id: 'f1' } },
				)
			},
			outcome: 'committed',
			expectedQueries: [
				'//v2019C1:InputVar[@varName="pathless"][@lnodeUuid="xcbr"][@dataName="SF1/XCBR1.Pos.stVal"]',
			],
		},
		// data's XCBR1 remapped onto CSWI1 of F2, out of FB's reach, as a copy's remap writes it
		'a remap of a variable onto an LNode out of its reach → the old path dropped, refused out-of-scope':
			{
				sourceXml: behaviours,
				write: async function remapOutOfReach(tx) {
					await applyUuidRemap(tx, {
						cloneMappings: [
							{
								source: {
									tagName: 'LNode',
									id: 'xcbr-source',
									attributes: [{ name: 'uuid', value: 'xcbr' }],
								},
								target: { tagName: 'LNode', id: 'cswi' },
							},
							{
								source: { tagName: 'OutputVar', id: 'data-source', attributes: [] },
								target: { tagName: 'OutputVar', id: 'data' },
							},
						] as unknown as Scl.CloneMapping[],
					})
				},
				outcome: 'REFERENCE_INCOHERENT out-of-scope',
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="data"][@lnodeUuid="xcbr"][@dataName="SF1/XCBR1.Pos.stVal"]',
				],
			},
		// XCBR1 moved into F2: F2B's pathless variable gets it in reach; FB's variables lose it
		'an LNode moved into the reach of a pathless variable naming it → its path written': {
			sourceXml: behaviours,
			write: async function moveLNodeIntoReach(tx) {
				await tx.move(
					{ tagName: 'LNode', id: 'xcbr' },
					{ parent: { tagName: 'Function', id: 'f2' } },
				)
			},
			outcome: 'committed',
			expectedQueries: [
				'//v2019C1:InputVar[@varName="pathless"][@lnodeUuid="xcbr"][@dataName="XCBR1.Pos.stVal"]',
			],
		},
		// data's path edited to PTRC1's data, its uuid kept: the commit resolves the path, as the import reads it
		'a Function behaviour variable whose path is edited through another LNode → its uuid and data names follow the path':
			{
				sourceXml: behaviours,
				write: async function editPath(tx) {
					await tx.any.update(DATA, { attributes: { dataName: 'PTRC1.Op.general' } })
				},
				outcome: 'committed',
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="data"][@lnodeUuid="ptrc"][@doName="Op"][@daName="general"][@dataName="PTRC1.Op.general"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const outcome = await source
			.transaction(async function writeReference(tx) {
				await testCase.write(tx)
			})
			.then(
				function committed() {
					return 'committed'
				},
				function refused(error: unknown) {
					const refusal = toDialecteError(error)
					const reason = (refusal?.meta as { reason?: string } | undefined)?.reason
					return refusal ? [refusal.key, reason].filter(Boolean).join(' ') : String(error)
				},
			)
		expect(outcome).toBe(testCase.outcome)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the query reads a Function behaviour data path as the import reads it', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: { target: string; qualifier: string } }

	const testCases: SclTest.TestCases<TestCase> = {
		// data names SF1/XCBR1.Pos.stVal from F1: XCBR1, then its data Pos.stVal
		'a Function behaviour variable naming data through its LNode → that LNode, and the data after it':
			{
				sourceXml: behaviours,
				expected: { target: 'xcbr', qualifier: 'Pos.stVal' },
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const record = await source.query.getRecord(DATA)
		if (!record) throw new Error('data missing')
		const resolved = await resolveReferencePath(source.query, record, 'dataName')
		expect({ target: resolved?.record.id, qualifier: resolved?.qualifier }).toEqual(
			testCase.expected,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('a mapped data name is kept on create and on copy', () => {
	type TestCase = SclTest.BaseXmlTestCase & { write: (tx: Scl.Transaction) => Promise<void> }

	// the LNode names the logical node PTOC1 of the IED VENDOR; its DOS Mod is mapped to PTOC1's Health
	const mappedXml = /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="s1" name="S1">
				<Function ${id}="f1" name="F1">
					<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc">
						<Private ${id}="lnode-private" type="eIEC61850-6-100">
							<eIEC61850-6-100:DOS ${id}="mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc"/>
						</Private>
					</LNode>
				</Function>
			</Substation>
			<IED ${id}="ied" name="VENDOR">
				<AccessPoint ${id}="ap" name="AP1">
					<Server ${id}="server">
						<LDevice ${id}="ld" inst="LD0">
							<LN ${id}="ptoc" lnClass="PTOC" inst="1" lnType="PTOC_T" uuid="ptoc"/>
						</LDevice>
					</Server>
				</AccessPoint>
			</IED>
		</SCL>
	`

	const testCases: SclTest.TestCases<TestCase> = {
		// a DOS created mapped to PTOC1's Health
		'a DOS created with a mapped name → its mapped name kept': {
			sourceXml: mappedXml,
			write: async function addMappedDos(tx) {
				await tx.any.addChild(
					{ tagName: 'Private', id: 'lnode-private' } as Scl.Ref<Scl.ElementsOf>,
					{
						tagName: 'DOS',
						attributes: { name: 'Beh', mappedDoName: 'Health', mappedLnUuid: 'ptoc' },
					},
				)
			},
			expectedQueries: ['//v2019C1:DOS[@name="Beh"][@mappedDoName="Health"][@mappedLnUuid="ptoc"]'],
		},
		// the DOS Mod copied beside itself
		'a mapped DOS copied → the copy keeps its mapped name': {
			sourceXml: mappedXml,
			write: async function copyMappedDos(tx) {
				const tree = await tx.getTree({ tagName: 'DOS', id: 'mod' } as Scl.Ref<Scl.ElementsOf>)
				await tx.deepClone(
					{ tagName: 'Private', id: 'lnode-private' } as Scl.Ref<Scl.ElementsOf>,
					tree as Scl.TreeRecord<'DOS'>,
				)
			},
			expectedQueries: [
				'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc"][2]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function writeMappedData(tx) {
			await testCase.write(tx)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
