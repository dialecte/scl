import searchXml from './fixtures/search-mixed.xml?raw'
import { ofEach } from './of-each'
import { search } from './search'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SearchHit, SearchParams } from './search.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

/**
 * The hits of fixtures/search-mixed.xml: bays sharing a title in two voltage levels and one in upper case, a label,
 * two signals named among each other under a Private, a title read from a child (an ApplicationSclRef under a
 * Private), an IED holding an access point and a Header to leave out.
 */
const BAY1: SearchHit = {
	tagName: 'Bay',
	id: 'bay1',
	title: 'Feeder1',
	ancestorIds: ['root', 's1', 'vl1'],
}
const BAY2: SearchHit = {
	tagName: 'Bay',
	id: 'bay2',
	title: 'FEEDER2',
	ancestorIds: ['root', 's1', 'vl1'],
}
const BAY3: SearchHit = {
	tagName: 'Bay',
	id: 'bay3',
	title: 'Feeder1',
	ancestorIds: ['root', 's1', 'vl2'],
}
const LABEL1: SearchHit = {
	tagName: 'Label',
	id: 'label1',
	title: 'Line feeder',
	ancestorIds: ['root', 's1', 'vl1', 'bay1', 'labels1'],
}
const IED1: SearchHit = { tagName: 'IED', id: 'ied1', title: 'FeederIED', ancestorIds: ['root'] }

/** The hits in a fixed order (by id) where the store's order within a tag is not the point. */
function byId(hits: readonly SearchHit[]): SearchHit[] {
	return [...hits].sort((left, right) => left.id.localeCompare(right.id))
}

describe('search - the elements whose title holds the term', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		params: SearchParams
		/** The hits, in any order. */
		expected: SearchHit[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a term over several tags → every element whose title holds it, with its ancestors from the root':
			{
				sourceXml: searchXml,
				params: { term: 'feeder', tagNames: ['Bay', 'Label', 'IED'] },
				expected: [BAY1, BAY2, BAY3, LABEL1, IED1],
			},
		'the term in another case → the same hits': {
			sourceXml: searchXml,
			params: { term: 'FeEdEr1', tagNames: ['Bay'] },
			expected: [BAY1, BAY3],
		},
		'the term padded with spaces → matched trimmed': {
			sourceXml: searchXml,
			params: { term: '  feeder2 ', tagNames: ['Bay'] },
			expected: [BAY2],
		},
		'a tag given twice, two elements sharing a title → each element once': {
			sourceXml: searchXml,
			params: { term: 'Feeder1', tagNames: ['Bay', 'Bay'] },
			expected: [BAY1, BAY3],
		},
		'no title holding the term → no hit': {
			sourceXml: searchXml,
			params: { term: 'busbar', tagNames: ['Bay', 'Label', 'IED'] },
			expected: [],
		},
		'an empty term → no hit': {
			sourceXml: searchXml,
			params: { term: '   ', tagNames: ['Bay', 'Label', 'IED'] },
			expected: [],
		},
		'a signal under a Private → named among its siblings, the Private left out of its ancestors': {
			sourceXml: searchXml,
			params: { term: 'trip(2', tagNames: ['SourceRef'] },
			expected: [
				{
					tagName: 'SourceRef',
					id: 'sr2',
					title: 'Trip(2)',
					ancestorIds: ['root', 's1', 'vl1', 'bay1', 'f1', 'lnode1'],
				},
			],
		},
		'a title read from a child → matched on that title': {
			sourceXml: searchXml,
			params: { term: 'icd v1', tagNames: ['ApplicationSclRef'] },
			expected: [
				{
					tagName: 'ApplicationSclRef',
					id: 'asr',
					title: 'ICD v1.A',
					ancestorIds: ['root', 's1', 'vl2', 'bay3', 'app1'],
				},
			],
		},
		'a term only the full title holds, compact asked → no hit': {
			sourceXml: searchXml,
			params: { term: 'none/', tagNames: ['LNode'] },
			expected: [],
		},
		'a term only the full title holds, full asked → the full title': {
			sourceXml: searchXml,
			params: { term: 'none/', tagNames: ['LNode'], mode: 'full' },
			expected: [
				{
					tagName: 'LNode',
					id: 'lnode1',
					title: 'None/PTRC1',
					ancestorIds: ['root', 's1', 'vl1', 'bay1', 'f1'],
				},
			],
		},
		'a tag omitted → its elements left out': {
			sourceXml: searchXml,
			params: { term: 'feeder', tagNames: ['Bay', 'Label', 'IED'], omit: ['IED'] },
			expected: [BAY1, BAY2, BAY3, LABEL1],
		},
		'a hit under a tag not omitted → found, with that ancestor': {
			sourceXml: searchXml,
			params: { term: 'feeder ap', tagNames: ['AccessPoint'] },
			expected: [
				{ tagName: 'AccessPoint', id: 'ap1', title: 'Feeder AP', ancestorIds: ['root', 'ied1'] },
			],
		},
		'a hit under an omitted tag → left out': {
			sourceXml: searchXml,
			params: { term: 'feeder ap', tagNames: ['AccessPoint'], omit: ['IED'] },
			expected: [],
		},
		'a hit under a Private, the Private omitted → left out': {
			sourceXml: searchXml,
			params: { term: 'trip', tagNames: ['SourceRef'], omit: ['Private'] },
			expected: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const hits = await search(source.query, testCase.params)
			expect(byId(hits)).toEqual(byId(testCase.expected))
		},
	})
})

/** The hits come in the order of the tags given; a limit keeps the first ones, once the omitted are left out. */
describe('search - the order of the hits and the limit', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		params: SearchParams
		/** The hits, in this order. */
		expected: SearchHit[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'tags given in another order than the document → the hits in the order of the tags': {
			sourceXml: searchXml,
			params: { term: 'feeder', tagNames: ['IED', 'Label'] },
			expected: [IED1, LABEL1],
		},
		'a limit → at most that many hits, the first in the answer': {
			sourceXml: searchXml,
			params: { term: 'feeder', tagNames: ['IED', 'Label', 'Bay'], limit: 2 },
			expected: [IED1, LABEL1],
		},
		'a limit and a first hit under an omitted tag → the limit counts the hits kept': {
			sourceXml: searchXml,
			params: { term: 'feeder', tagNames: ['AccessPoint', 'Label'], omit: ['IED'], limit: 1 },
			expected: [LABEL1],
		},
		'a limit of 0 → no hit': {
			sourceXml: searchXml,
			params: { term: 'feeder', tagNames: ['Bay'], limit: 0 },
			expected: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const hits = await search(source.query, testCase.params)
			expect(hits).toEqual(testCase.expected)
		},
	})
})

/**
 * Parity with a tree read in memory: the tree with `Private` unwrapped, the omitted tags' branches left out, each row
 * titled by `ofEach`, kept when its title holds the term, the path of rows above it as its ancestors. The search is
 * given every tag of the whole tree, the omitted ones included, so `omit` decides what it leaves out.
 */
describe('search - as a tree filtered in memory', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		term: string
		mode?: 'compact' | 'full'
		/** Whether the tree filtered in memory finds anything (the parity is not checked on two empty answers only). */
		found: boolean
	}

	const OMIT = ['Header', 'IED'] as const

	const testCases: SclTest.TestCases<TestCase> = {
		'a term many titles hold': { sourceXml: searchXml, term: 'e', found: true },
		'a term in names, also under an omitted tag': {
			sourceXml: searchXml,
			term: 'feeder',
			found: true,
		},
		'a term in signal names': { sourceXml: searchXml, term: 'trip', found: true },
		'a term in a digit': { sourceXml: searchXml, term: '1', found: true },
		'a term in full titles': { sourceXml: searchXml, term: 'none/', mode: 'full', found: true },
		'a term no title holds': { sourceXml: searchXml, term: 'busbar', found: false },
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const root = await source.query.getRoot()
			const tree = await source.query.getTree(root, { unwrap: ['Private'] })
			if (!tree) throw new Error('the fixture has no root')
			const rows = treeRows({ node: tree, ancestorIds: [], omit: OMIT })
			const nodes = rows.map((row) => row.node)
			const infos = await ofEach(source.query, nodes, { mode: testCase.mode })
			const needle = testCase.term.toLocaleLowerCase()
			const filtered: SearchHit[] = []
			for (let index = 0; index < rows.length; index++) {
				const { node, ancestorIds } = rows[index]
				const title = infos[index].title
				if (!title.toLocaleLowerCase().includes(needle)) continue
				filtered.push({ tagName: node.tagName, id: node.id, title, ancestorIds })
			}
			const everyRow = treeRows({ node: tree, ancestorIds: [], omit: [] })
			const tagNames = [...new Set(everyRow.map((row) => row.node.tagName as Scl.ElementsOf))]

			const hits = await search(source.query, {
				term: testCase.term,
				tagNames,
				omit: OMIT,
				mode: testCase.mode,
			})

			expect(filtered.length > 0).toBe(testCase.found)
			expect(byId(hits)).toEqual(byId(filtered))
		},
	})
})

/** The rows of a tree read, depth first, each with the ids of the rows above it; the omitted tags' branches left out. */
function treeRows(params: {
	node: Core.AnyTreeRecord
	ancestorIds: string[]
	omit: readonly string[]
}): { node: Core.AnyTreeRecord; ancestorIds: string[] }[] {
	const { node, ancestorIds, omit } = params
	if (omit.includes(node.tagName)) return []
	const below = [...ancestorIds, node.id]
	return [
		{ node, ancestorIds },
		...node.tree.flatMap((child) => treeRows({ node: child, ancestorIds: below, omit })),
	]
}
