import breakersAndATripInput from './fixtures/breakers-and-a-trip-input.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const INPUT = { tagName: 'SourceRef', id: 'ref1' } as Scl.Ref<Scl.ElementsOf>
const INPUTS = { tagName: 'LNodeInputs', id: 'inputs' } as Scl.Ref<Scl.ElementsOf>
const NAMING = { tagName: 'LNodeSpecNaming', id: 'xcbr6-naming' } as Scl.Ref<Scl.ElementsOf>

describe('a path edit retargets each pair of a reference, by kind', () => {
	type TestCase = SclTest.BaseXmlTestCase & { edited: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// breakers-and-a-trip-input.xml: ref1 names Pos.stVal of XCBR1, from resource PR1
		'the data path pointed at XCBR2, same data → the logical node uuid follows, the resource kept':
			{
				sourceXml: breakersAndATripInput,
				edited: { source: 'S1/F1/XCBR2.Pos.stVal' },
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/F1/XCBR2.Pos.stVal"][@sourceLNodeUuid="xcbr2"][@sourceDoName="Pos"][@sourceDaName="stVal"][@resourceName="PR1"][@resourceUuid="pr1"]',
				],
			},
		// a resource is named by its bare name, among those of its function
		'the resource name pointed at PR2 → the resource uuid follows, the data path kept': {
			sourceXml: breakersAndATripInput,
			edited: { resourceName: 'PR2' },
			expectedQueries: [
				'//v2019C1:SourceRef[@source="S1/F1/XCBR1.Pos.stVal"][@sourceLNodeUuid="xcbr1"][@resourceName="PR2"][@resourceUuid="pr2"]',
			],
		},
		// XCBR1's type XCBR_T holds Loc.stVal
		'the data path pointed at Loc.stVal of XCBR1 → the data names follow it': {
			sourceXml: breakersAndATripInput,
			edited: { source: 'S1/F1/XCBR1.Loc.stVal' },
			expectedQueries: [
				'//v2019C1:SourceRef[@source="S1/F1/XCBR1.Loc.stVal"][@sourceLNodeUuid="xcbr1"][@sourceDoName="Loc"][@sourceDaName="stVal"]',
			],
		},
		// the data path ends on the data object: the data attribute name goes
		'the data path pointed at Pos of XCBR1, no data attribute → the data object name kept, the attribute name removed':
			{
				sourceXml: breakersAndATripInput,
				edited: { source: 'S1/F1/XCBR1.Pos' },
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/F1/XCBR1.Pos"][@sourceLNodeUuid="xcbr1"][@sourceDoName="Pos"]',
				],
				unexpectedQueries: ['//v2019C1:SourceRef[@sourceDaName]'],
			},
		// a path stopping at the logical node, the data named beside it, is a standard form: kept as written
		'the data path pointed at XCBR2, no data → the uuid follows, the data held beside it kept': {
			sourceXml: breakersAndATripInput,
			edited: { source: 'S1/F1/XCBR2' },
			expectedQueries: [
				'//v2019C1:SourceRef[@source="S1/F1/XCBR2"][@sourceLNodeUuid="xcbr2"][@sourceDoName="Pos"][@sourceDaName="stVal"]',
			],
		},
		// ref1 holds two pairs: its data path and its resource name
		'both paths edited in one update → both uuids follow': {
			sourceXml: breakersAndATripInput,
			edited: { source: 'S1/F1/XCBR2.Pos.stVal', resourceName: 'PR2' },
			expectedQueries: ['//v2019C1:SourceRef[@sourceLNodeUuid="xcbr2"][@resourceUuid="pr2"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editPaths(tx) {
			await tx.any.update(INPUT, { attributes: testCase.edited })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a path edit naming nothing for one pair of a reference, by kind', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		edited: Record<string, string>
		expected: { key: string | undefined; meta: unknown }
	}

	const unresolvedResource = {
		key: 'REFERENCE_NAMES_UNRESOLVED',
		meta: {
			reference: { tagName: 'SourceRef', id: 'ref1' },
			uuidAttribute: 'resourceUuid',
			address: 'PR9',
			resolved: 'none',
		},
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// F1 holds no resource PR9
		'the resource name pointed at PR9 → refused, naming the resource uuid': {
			sourceXml: breakersAndATripInput,
			edited: { resourceName: 'PR9' },
			expected: unresolvedResource,
		},
		// the data path resolves to XCBR2; the commit is refused all the same
		'the data path resolved, the resource name naming nothing → refused, naming the resource uuid':
			{
				sourceXml: breakersAndATripInput,
				edited: { source: 'S1/F1/XCBR2.Pos.stVal', resourceName: 'PR9' },
				expected: unresolvedResource,
			},
		// XCBR1's type holds no data object Blk
		'the data path pointed at data the logical node type lacks → refused, naming the data path': {
			sourceXml: breakersAndATripInput,
			edited: { source: 'S1/F1/XCBR1.Blk.stVal' },
			expected: {
				key: 'REFERENCE_NAMES_UNRESOLVED',
				meta: {
					reference: { tagName: 'SourceRef', id: 'ref1' },
					uuidAttribute: 'sourceLNodeUuid',
					address: 'S1/F1/XCBR1.Blk.stVal',
					resolved: 'none',
					dataPath: 'Blk.stVal',
				},
			},
		},
		// XCBR4 has no type: its data path cannot be split
		'the data path pointed at other data of a logical node of no type → refused, naming the data path and no type':
			{
				sourceXml: breakersAndATripInput,
				edited: { source: 'S1/F1/XCBR4.Pos.q' },
				expected: {
					key: 'REFERENCE_NAMES_UNRESOLVED',
					meta: {
						reference: { tagName: 'SourceRef', id: 'ref1' },
						uuidAttribute: 'sourceLNodeUuid',
						address: 'S1/F1/XCBR4.Pos.q',
						resolved: 'none',
						dataPath: 'Pos.q',
						untyped: true,
					},
				},
			},
		// F1 holds two breakers named XCBR3
		'the data path pointed at a logical node two hold → refused, as naming several': {
			sourceXml: breakersAndATripInput,
			edited: { source: 'S1/F1/XCBR3.Pos.stVal' },
			expected: {
				key: 'REFERENCE_NAMES_UNRESOLVED',
				meta: {
					reference: { tagName: 'SourceRef', id: 'ref1' },
					uuidAttribute: 'sourceLNodeUuid',
					address: 'S1/F1/XCBR3.Pos.stVal',
					resolved: 'several',
				},
			},
		},
		// F1 holds no XCBR9
		'the data path pointed at XCBR9 → refused, naming the logical node uuid': {
			sourceXml: breakersAndATripInput,
			edited: { source: 'S1/F1/XCBR9.Pos.stVal' },
			expected: {
				key: 'REFERENCE_NAMES_UNRESOLVED',
				meta: {
					reference: { tagName: 'SourceRef', id: 'ref1' },
					uuidAttribute: 'sourceLNodeUuid',
					address: 'S1/F1/XCBR9.Pos.stVal',
					resolved: 'none',
				},
			},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const refused = await source
			.transaction(async function editPaths(tx) {
				await tx.any.update(INPUT, { attributes: testCase.edited })
			})
			.then(function committed() {
				return undefined
			})
			.catch(function refusal(error: unknown) {
				const dialecteError = toDialecteError(error)
				return { key: dialecteError?.key, meta: dialecteError?.meta }
			})
		expect(refused).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('a path edit, then an edit of the data names beside it in the same transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string; dataNames: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// breakers-and-a-trip-input.xml: ref1 names Pos.stVal of XCBR1; while the edit waits, the path decides the data
		'the data path pointed at XCBR2, then its data attribute name edited → retargeted, the data the path names kept':
			{
				sourceXml: breakersAndATripInput,
				path: 'S1/F1/XCBR2.Pos.stVal',
				dataNames: { sourceDaName: 'q' },
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/F1/XCBR2.Pos.stVal"][@sourceLNodeUuid="xcbr2"][@sourceDoName="Pos"][@sourceDaName="stVal"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editPathThenDataNames(tx) {
			await tx.any.update(INPUT, { attributes: { source: testCase.path } })
			await tx.any.update(INPUT, { attributes: testCase.dataNames })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a reference waiting for a logical node named by its specification naming', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string; naming: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// XCBR6, bound to IED1, is named by its naming: its instance 6 becomes 7, the name the waiting path holds
		'the specification naming of a bound logical node given the name a waiting path holds → its uuid written':
			{
				sourceXml: breakersAndATripInput,
				path: 'S1/F1/XCBR7.Pos.stVal',
				naming: { sLnInst: '7' },
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/F1/XCBR7.Pos.stVal"][@sourceLNodeUuid="xcbr6"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addWaitingInput(tx) {
			await tx.any.addChild(INPUTS, {
				tagName: 'SourceRef',
				attributes: {
					input: 'Pos2',
					source: testCase.path,
					sourceDoName: 'Pos',
					sourceDaName: 'stVal',
				},
			})
		})
		await source.transaction(async function renameByNaming(tx) {
			await tx.any.update(NAMING, { attributes: testCase.naming })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a path edit of one pair, then an edit of the data names of another pair in the same transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		edited: Record<string, string>
		dataNames: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// breakers-and-a-trip-input.xml: ref1's resource pointed at PR2, then its data attribute name at q of Pos
		'the resource name pointed at PR2, then the data attribute name edited → the data path follows the data names':
			{
				sourceXml: breakersAndATripInput,
				edited: { resourceName: 'PR2' },
				dataNames: { sourceDaName: 'q' },
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/F1/XCBR1.Pos.q"][@sourceDaName="q"][@resourceName="PR2"][@resourceUuid="pr2"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editResourceThenDataNames(tx) {
			await tx.any.update(INPUT, { attributes: testCase.edited })
			await tx.any.update(INPUT, { attributes: testCase.dataNames })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
