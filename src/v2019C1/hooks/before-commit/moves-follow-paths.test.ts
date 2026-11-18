import twoVoltageLevels from './fixtures/two-voltage-levels-with-functions-and-nodes.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/** An element and the parent a transaction moves it under. */
type Move = { element: Scl.Ref<Scl.ElementsOf>; parent: Scl.Ref<Scl.ElementsOf> }

const F1 = { tagName: 'Function', id: 'f1' } as Scl.Ref<Scl.ElementsOf>
const SF1 = { tagName: 'SubFunction', id: 'sf1' } as Scl.Ref<Scl.ElementsOf>
const B1 = { tagName: 'Bay', id: 'b1' } as Scl.Ref<Scl.ElementsOf>
const B2 = { tagName: 'Bay', id: 'b2' } as Scl.Ref<Scl.ElementsOf>
const F2 = { tagName: 'Function', id: 'f2' } as Scl.Ref<Scl.ElementsOf>
const VL1 = { tagName: 'VoltageLevel', id: 'vl1' } as Scl.Ref<Scl.ElementsOf>
const VL2 = { tagName: 'VoltageLevel', id: 'vl2' } as Scl.Ref<Scl.ElementsOf>

describe('the commit follows the paths of what a transaction moved', () => {
	type TestCase = SclTest.BaseXmlTestCase & { moves: Move[] }

	const testCases: SclTest.TestCases<TestCase> = {
		// F1 is named by the category C1 (ref1) and, through its LNode PTRC1, by the SourceRef of F2
		'F1 moved from B1 to B2 → the category and the SourceRef name it under B2, their uuids kept': {
			sourceXml: twoVoltageLevels,
			moves: [{ element: F1, parent: B2 }],
			expectedQueries: [
				'//v2019C1:FunctionCatRef[@function="S1/VL1/B2/F1"][@functionUuid="f1"]',
				'//v2019C1:SourceRef[@source="S1/VL1/B2/F1/PTRC1.Op"][@sourceLNodeUuid="ln1"]',
				'//default:Bay[@name="B2"]/default:Function[@name="F1"][@uuid="f1"]',
			],
		},
		// B1 holds L1, named by t-inner (inside B1) and t-outer (in B2)
		'B1 moved from VL1 to VL2 → L1, its terminals inside and outside B1 and the paths below B1 under VL2':
			{
				sourceXml: twoVoltageLevels,
				moves: [{ element: B1, parent: VL2 }],
				expectedQueries: [
					'//default:ConnectivityNode[@name="L1"][@pathName="S1/VL2/B1/L1"][@uuid="n1"]',
					'//default:Terminal[@cNodeUuid="n1"][@connectivityNode="S1/VL2/B1/L1"][@voltageLevelName="VL2"][@bayName="B1"]/parent::default:ConductingEquipment[@name="QA1"]',
					'//default:Terminal[@cNodeUuid="n1"][@connectivityNode="S1/VL2/B1/L1"][@voltageLevelName="VL2"][@bayName="B1"]/parent::default:ConductingEquipment[@name="QA2"]',
					'//v2019C1:FunctionCatRef[@function="S1/VL2/B1/F1"][@functionUuid="f1"]',
					'//v2019C1:SourceRef[@source="S1/VL2/B1/F1/PTRC1.Op"]',
				],
			},
		// F1 goes to B2 and B1 (holding L1) goes to VL2, in one transaction
		'F1 moved to B2 and B1 to VL2 → both followed': {
			sourceXml: twoVoltageLevels,
			moves: [
				{ element: F1, parent: B2 },
				{ element: B1, parent: VL2 },
			],
			expectedQueries: [
				'//v2019C1:FunctionCatRef[@function="S1/VL1/B2/F1"][@functionUuid="f1"]',
				'//v2019C1:SourceRef[@source="S1/VL1/B2/F1/PTRC1.Op"]',
				'//default:ConnectivityNode[@name="L1"][@pathName="S1/VL2/B1/L1"]',
			],
		},
		// SF1 moves into F2 while B1, which holds it, moves to VL2: SF1 ends below B2, outside the moved B1
		'B1 moved to VL2 and SF1 out of it into F2 → SF1 followed from its own move, L1 from the bay': {
			sourceXml: twoVoltageLevels,
			moves: [
				{ element: B1, parent: VL2 },
				{ element: SF1, parent: F2 },
			],
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:Function[@name="F2"]/default:SubFunction[@name="SF1"][@uuid="sf1"]',
				// XCBR1 in SF1 is named by the second SourceRef of F2
				'//v2019C1:SourceRef[@source="S1/VL1/B2/F2/SF1/XCBR1.Pos"][@sourceLNodeUuid="ln3"]',
				'//default:ConnectivityNode[@name="L1"][@pathName="S1/VL2/B1/L1"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveEach(tx) {
			for (const { element, parent } of testCase.moves) await tx.any.move(element, { parent })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit follows a record the transaction created, then moved', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		created: { parent: Scl.Ref<Scl.ElementsOf>; attributes: Record<string, string> }
		parent: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// the node L9 is created in B1 (its path written there), then moved to B2
		'a node created in B1, then moved to B2 → its path names B2': {
			sourceXml: twoVoltageLevels,
			created: { parent: B1, attributes: { name: 'L9', uuid: 'n9' } },
			parent: B2,
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:ConnectivityNode[@name="L9"][@pathName="S1/VL1/B2/L9"][@uuid="n9"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function createThenMove(tx) {
			const node = await tx.any.addChild(testCase.created.parent, {
				tagName: 'ConnectivityNode',
				attributes: testCase.created.attributes,
			})
			await tx.any.move(node, { parent: testCase.parent })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit follows a move into a container the transaction created', () => {
	type TestCase = SclTest.BaseXmlTestCase & { bayName: string }

	const testCases: SclTest.TestCases<TestCase> = {
		// the bay B9 is created in VL1, then F1 moves into it
		'F1 moved into a bay B9 created in the same transaction → the category names it under B9': {
			sourceXml: twoVoltageLevels,
			bayName: 'B9',
			expectedQueries: [
				'//v2019C1:FunctionCatRef[@function="S1/VL1/B9/F1"][@functionUuid="f1"]',
				'//default:Bay[@name="B9"]/default:Function[@name="F1"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function createBayThenMove(tx) {
			const bay = await tx.any.addChild(VL1, {
				tagName: 'Bay',
				attributes: { name: testCase.bayName },
			})
			await tx.any.move(F1, { parent: bay })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit follows a move and a rename of one element in one transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & { name: string }

	const testCases: SclTest.TestCases<TestCase> = {
		// F1 is renamed F7 first (paths written under B1), then moved to B2
		'F1 renamed F7, then moved to B2 → the category names S1/VL1/B2/F7': {
			sourceXml: twoVoltageLevels,
			name: 'F7',
			expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B2/F7"][@functionUuid="f1"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function renameThenMove(tx) {
			await tx.any.update(F1, { attributes: { name: testCase.name } })
			await tx.any.move(F1, { parent: B2 })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit fills a path reference waiting for the place an element moves to', () => {
	type TestCase = SclTest.BaseXmlTestCase & { waitingPath: string }

	const testCases: SclTest.TestCases<TestCase> = {
		// the category C1 gets a reference to S1/VL1/B2/F1 by path, naming nothing yet, then F1 moves to B2
		'a reference by the path F1 takes under B2, then F1 moved there → its functionUuid written': {
			sourceXml: twoVoltageLevels,
			waitingPath: 'S1/VL1/B2/F1',
			expectedQueries: [
				// ref1, naming F1 by its uuid, follows it there too: two references to F1 under B2
				'//v2019C1:FunctionCategory[@name="C1"][count(v2019C1:FunctionCatRef[@function="S1/VL1/B2/F1"][@functionUuid="f1"])=2]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function referThenMove(tx) {
			await tx.any.addChild(
				{ tagName: 'FunctionCategory', id: 'c1' },
				{
					tagName: 'FunctionCatRef',
					attributes: { function: testCase.waitingPath },
				},
			)
			await tx.any.move(F1, { parent: B2 })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
