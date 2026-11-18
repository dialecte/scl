import { buildElementPaths } from './build-element-path'
import mixedXml from './fixtures/element-paths-mixed.xml?raw'

import { describe, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { ElementPath } from './path-segment.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const V2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

/**
 * An element path as the tests compare it: its string and the id of the element each segment names, `null` for no
 * path.
 */
type PathShape = { path: string; segmentIds: string[] } | null

/** An element of the mixed fixture with the path it has. */
type Expected = { ref: Scl.Ref<Scl.ElementsOf>; path: PathShape }

const BAY_PATH = ['sub-1', 'vl-1', 'bay-1']
const LN_PATH = ['ied-1', 'ld-1', 'ln-1']

/**
 * The elements of the mixed fixture, every tag of it, each with its path: the Bay's three LNodes assigned to IED1 are
 * named by their spec naming (directly under it, in its Private, both: the direct one), the signals of the Private
 * holding both signal tags are named among their own tag, the root, transparent containers and types have none.
 */
const MIXED: Expected[] = [
	{ ref: { tagName: 'SCL', id: 'scl-1' }, path: null },
	{ ref: { tagName: 'Substation', id: 'sub-1' }, path: { path: 'S1', segmentIds: ['sub-1'] } },
	{
		ref: { tagName: 'VoltageLevel', id: 'vl-1' },
		path: { path: 'S1/V1', segmentIds: ['sub-1', 'vl-1'] },
	},
	{ ref: { tagName: 'Bay', id: 'bay-1' }, path: { path: 'S1/V1/B1', segmentIds: BAY_PATH } },
	{
		ref: { tagName: 'ConductingEquipment', id: 'ce-1' },
		path: { path: 'S1/V1/B1/CE1', segmentIds: [...BAY_PATH, 'ce-1'] },
	},
	{
		ref: { tagName: 'LNode', id: 'ln-direct' },
		path: { path: 'S1/V1/B1/XCBR5', segmentIds: [...BAY_PATH, 'ln-direct'] },
	},
	{ ref: { tagName: 'LNodeSpecNaming', id: 'ln-direct-naming' }, path: null },
	{
		ref: { tagName: 'LNode', id: 'ln-wrapped' },
		path: { path: 'S1/V1/B1/PTRC8', segmentIds: [...BAY_PATH, 'ln-wrapped'] },
	},
	{ ref: { tagName: 'Private', id: 'ln-wrapped-private' }, path: null },
	{
		ref: { tagName: 'SourceRef', id: 'sr-1' },
		path: { path: 'S1/V1/B1/PTRC8.Trip', segmentIds: [...BAY_PATH, 'ln-wrapped', 'sr-1'] },
	},
	{
		ref: { tagName: 'ControlRef', id: 'cr-1' },
		path: { path: 'S1/V1/B1/PTRC8.Trip(1)', segmentIds: [...BAY_PATH, 'ln-wrapped', 'cr-1'] },
	},
	{
		ref: { tagName: 'ControlRef', id: 'cr-2' },
		path: { path: 'S1/V1/B1/PTRC8.Trip(2)', segmentIds: [...BAY_PATH, 'ln-wrapped', 'cr-2'] },
	},
	{
		ref: { tagName: 'LNode', id: 'ln-both' },
		path: { path: 'S1/V1/B1/XCBR6', segmentIds: [...BAY_PATH, 'ln-both'] },
	},
	{
		ref: { tagName: 'LNode', id: 'ln-plain' },
		path: { path: 'S1/V1/B1/CSWI3', segmentIds: [...BAY_PATH, 'ln-plain'] },
	},
	{
		ref: { tagName: 'SourceRef', id: 'sr-2' },
		path: { path: 'S1/V1/B1/CSWI3.Pos(1)', segmentIds: [...BAY_PATH, 'ln-plain', 'sr-2'] },
	},
	{
		ref: { tagName: 'SourceRef', id: 'sr-3' },
		path: { path: 'S1/V1/B1/CSWI3.Pos(2)', segmentIds: [...BAY_PATH, 'ln-plain', 'sr-3'] },
	},
	{ ref: { tagName: 'IED', id: 'ied-1' }, path: { path: 'IED1', segmentIds: ['ied-1'] } },
	{ ref: { tagName: 'AccessPoint', id: 'ap-1' }, path: null },
	{ ref: { tagName: 'Server', id: 'srv-1' }, path: null },
	{
		ref: { tagName: 'LDevice', id: 'ld-1' },
		path: { path: 'IED1/LD0', segmentIds: ['ied-1', 'ld-1'] },
	},
	{ ref: { tagName: 'LN', id: 'ln-1' }, path: { path: 'IED1/LD0/XCBR1', segmentIds: LN_PATH } },
	{
		ref: { tagName: 'DOI', id: 'doi-1' },
		path: { path: 'IED1/LD0/XCBR1.Pos', segmentIds: [...LN_PATH, 'doi-1'] },
	},
	{ ref: { tagName: 'DataTypeTemplates', id: 'dtt-1' }, path: null },
	{ ref: { tagName: 'LNodeType', id: 'lnt-1' }, path: null },
	{ ref: { tagName: 'DO', id: 'do-1' }, path: null },
	{ ref: { tagName: 'DA', id: 'da-1' }, path: null },
]

/** The entry of the mixed fixture of `id`. */
function mixed(id: string): Expected {
	const entry = MIXED.find((candidate) => candidate.ref.id === id)
	if (!entry) throw new Error(`no element ${id} in the mixed fixture`)
	return entry
}

/** A ref naming no element of the fixture. */
const NOTHING: Expected = { ref: { tagName: 'Bay', id: 'missing' }, path: null }

/** The paths as the tests compare them. */
function shapesOf(paths: readonly (ElementPath | null)[]): PathShape[] {
	return paths.map(function shapeOf(path) {
		return path
			? { path: path.path, segmentIds: path.segments.map((segment) => segment.ref.id ?? '') }
			: null
	})
}

/** One call over many elements answers each position the path of its element, the path each element had built alone. */
describe('buildElementPaths - one call over a mixed document', () => {
	type TestCase = SclTest.BaseXmlTestCase & { elements: Expected[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'every element of the document, every tag → each its own path and segments, null for the root, containers and types':
			{
				// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
				sourceXml: mixedXml,
				elements: MIXED,
			},
		'signals before their LNodes, the IED before the Substation, a duplicate and a ref naming nothing → input order kept':
			{
				// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
				sourceXml: mixedXml,
				elements: [
					mixed('cr-2'),
					mixed('sr-1'),
					NOTHING,
					mixed('doi-1'),
					mixed('ied-1'),
					mixed('cr-1'),
					mixed('ln-wrapped'),
					mixed('cr-2'),
					mixed('scl-1'),
					mixed('sub-1'),
					mixed('ln-both'),
					mixed('ln-direct'),
				],
			},
		'the signals of one Private alone, both tags → each named among its own tag': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			elements: [mixed('cr-1'), mixed('sr-1'), mixed('cr-2')],
		},
		'LNodes named directly, in a Private, and both → the direct naming wins over the Private one': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			elements: [mixed('ln-wrapped'), mixed('ln-both'), mixed('ln-direct')],
		},
		'only refs naming nothing or elements without a segment → null for each': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			elements: [NOTHING, mixed('scl-1'), mixed('ap-1'), mixed('lnt-1')],
		},
		'refs without id of singleton tags, beside an element → null for each, the element its path': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			elements: [
				{ ref: { tagName: 'SCL' }, path: null },
				mixed('ce-1'),
				{ ref: { tagName: 'DataTypeTemplates' }, path: null },
			],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const refs = testCase.elements.map((element) => element.ref)
			const paths = await buildElementPaths(source.query, { refs })
			expect(shapesOf(paths)).toEqual(testCase.elements.map((element) => element.path))
		},
	})
})

/** Elements given as records already read are read again: their paths are those of the elements as stored. */
describe('buildElementPaths - records given', () => {
	type TestCase = SclTest.BaseXmlTestCase & { elements: Expected[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'a signal, an LNode and an equipment given as records → their paths and segments': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			elements: [mixed('cr-1'), mixed('ln-both'), mixed('ce-1')],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const read = await source.query.getRecords(testCase.elements.map((element) => element.ref))
			const records = read.flatMap(function readOnly(record) {
				return record ? [record] : []
			})
			const paths = await buildElementPaths(source.query, { refs: records })
			expect(shapesOf(paths)).toEqual(testCase.elements.map((element) => element.path))
		},
	})
})

/** An element given twice answers its full path at each position. */
describe('buildElementPaths - an element given twice', () => {
	type TestCase = SclTest.BaseXmlTestCase & { id: string }

	const testCases: SclTest.TestCases<TestCase> = {
		'a signal given twice → the same path and segments twice': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			id: 'cr-1',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const { ref, path } = mixed(testCase.id)
			const paths = await buildElementPaths(source.query, { refs: [ref, ref] })
			expect(shapesOf(paths)).toEqual([path, path])
		},
	})
})

/** A ref whose tag is not its element's refuses the whole call, the paths of the other refs included. */
describe('buildElementPaths - a ref naming another element', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		expectedError: string
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a ref naming the Substation as a Bay, after an equipment → refused with ELEMENT_TAGNAME_MISMATCH':
			{
				// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
				sourceXml: mixedXml,
				refs: [
					{ tagName: 'ConductingEquipment', id: 'ce-1' },
					{ tagName: 'Bay', id: 'sub-1' },
				],
				expectedError: "Expected tagName 'Bay', got 'Substation' for id 'sub-1'",
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await expect(buildElementPaths(source.query, { refs: testCase.refs })).rejects.toThrow(
				testCase.expectedError,
			)
		},
	})
})

/** Inside a transaction, the staged writes answer: renamed ancestors, spec namings and siblings as staged. */
describe('buildElementPaths - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		stage: (tx: Scl.Transaction) => Promise<Scl.Ref<Scl.ElementsOf>[]>
		expected: (staged: Scl.Ref<Scl.ElementsOf>[]) => PathShape[]
	}

	const STAGED_BAY = ['sub-1', 'vl-1', 'bay-1']

	const testCases: SclTest.TestCases<TestCase> = {
		'a Bay renamed, a spec naming changed, a ControlRef deleted, an equipment created → the staged paths':
			{
				// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
				sourceXml: mixedXml,
				stage: async function stageWrites(tx) {
					await tx.update({ tagName: 'Bay', id: 'bay-1' }, { attributes: { name: 'B2' } })
					await tx.update(
						{ tagName: 'LNodeSpecNaming', id: 'ln-wrapped-naming' },
						{ attributes: { sLnInst: '9' } },
					)
					await tx.delete({ tagName: 'ControlRef', id: 'cr-2' })
					const created = await tx.addChild(
						{ tagName: 'Bay', id: 'bay-1' },
						{ tagName: 'ConductingEquipment', attributes: { name: 'CE2', type: 'DIS' } },
					)
					return [
						created,
						{ tagName: 'ConductingEquipment', id: 'ce-1' },
						{ tagName: 'ControlRef', id: 'cr-1' },
						{ tagName: 'SourceRef', id: 'sr-1' },
						{ tagName: 'ControlRef', id: 'cr-2' },
						{ tagName: 'LNode', id: 'ln-direct' },
					]
				},
				expected: ([created]) => [
					{ path: 'S1/V1/B2/CE2', segmentIds: [...STAGED_BAY, created.id ?? ''] },
					{ path: 'S1/V1/B2/CE1', segmentIds: [...STAGED_BAY, 'ce-1'] },
					{ path: 'S1/V1/B2/PTRC9.Trip', segmentIds: [...STAGED_BAY, 'ln-wrapped', 'cr-1'] },
					{ path: 'S1/V1/B2/PTRC9.Trip', segmentIds: [...STAGED_BAY, 'ln-wrapped', 'sr-1'] },
					null,
					{ path: 'S1/V1/B2/XCBR5', segmentIds: [...STAGED_BAY, 'ln-direct'] },
				],
			},
		'the Bay deleted, its equipment, LNode and signal asked with the VoltageLevel above → null for the deleted subtree, the VoltageLevel its path':
			{
				// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
				sourceXml: mixedXml,
				stage: async function deleteBay(tx) {
					await tx.delete({ tagName: 'Bay', id: 'bay-1' })
					return [
						{ tagName: 'ConductingEquipment', id: 'ce-1' },
						{ tagName: 'LNode', id: 'ln-direct' },
						{ tagName: 'ControlRef', id: 'cr-1' },
						{ tagName: 'VoltageLevel', id: 'vl-1' },
					]
				},
				expected: () => [null, null, null, { path: 'S1/V1', segmentIds: ['sub-1', 'vl-1'] }],
			},
		'a ControlRef created beside the others → named among the staged ControlRefs': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			stage: async function stageSignal(tx) {
				const created = await tx.any.addChild(
					{ tagName: 'Private', id: 'ln-wrapped-private' },
					{
						tagName: 'ControlRef',
						namespace: V2019C1,
						attributes: { output: 'Trip', outputInst: '3' },
					},
				)
				return [
					created as Scl.Ref<Scl.ElementsOf>,
					{ tagName: 'ControlRef', id: 'cr-1' },
					{ tagName: 'SourceRef', id: 'sr-1' },
				]
			},
			expected: ([created]) => [
				{
					path: 'S1/V1/B1/PTRC8.Trip(3)',
					segmentIds: [...STAGED_BAY, 'ln-wrapped', created.id ?? ''],
				},
				{ path: 'S1/V1/B1/PTRC8.Trip(1)', segmentIds: [...STAGED_BAY, 'ln-wrapped', 'cr-1'] },
				{ path: 'S1/V1/B1/PTRC8.Trip', segmentIds: [...STAGED_BAY, 'ln-wrapped', 'sr-1'] },
			],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const answered: { staged: Scl.Ref<Scl.ElementsOf>[]; shapes: PathShape[] } = {
				staged: [],
				shapes: [],
			}
			await source.transaction(async function readStaged(tx) {
				answered.staged = await testCase.stage(tx)
				const paths = await buildElementPaths(tx, { refs: answered.staged })
				answered.shapes = shapesOf(paths)
			})
			expect(answered.shapes).toEqual(testCase.expected(answered.staged))
		},
	})
})

/** Inside a transaction, a record read before a staged rename answers the staged path: it is read again. */
describe('buildElementPaths - a record read before a staged write', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: PathShape }

	const testCases: SclTest.TestCases<TestCase> = {
		'a Bay record read, then renamed in the transaction → the staged name': {
			// a Bay with an equipment and four LNodes (three named by spec naming, signals of both tags in one Private), an IED, types
			sourceXml: mixedXml,
			expected: { path: 'S1/V1/B2', segmentIds: ['sub-1', 'vl-1', 'bay-1'] },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const bay = await source.query.getRecord({ tagName: 'Bay', id: 'bay-1' })
			const answered: PathShape[] = []
			await source.transaction(async function readStaged(tx) {
				await tx.update({ tagName: 'Bay', id: 'bay-1' }, { attributes: { name: 'B2' } })
				const paths = await buildElementPaths(tx, { refs: bay ? [bay] : [] })
				answered.push(...shapesOf(paths))
			})
			expect(answered).toEqual([testCase.expected])
		},
	})
})
