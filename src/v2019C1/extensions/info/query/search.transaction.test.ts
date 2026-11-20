import searchXml from './fixtures/search-mixed.xml?raw'
import { search } from './search'

import { describe, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { runSclTestCases } from '@/v2019C1/test'

import type { SearchHit, SearchParams } from './search.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const V2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

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

/** The hits in a fixed order (by id) where the store's order within a tag is not the point. */
function byId(hits: readonly SearchHit[]): SearchHit[] {
	return [...hits].sort((left, right) => left.id.localeCompare(right.id))
}

/** Inside a transaction the staged state is searched: created, updated, renamed and deleted elements as staged. */
describe('search - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** Stages the change, then answers the search to make and the hits it must find. */
		stage: (tx: Scl.Transaction) => Promise<{ params: SearchParams; expected: SearchHit[] }>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a Bay created → found, under its staged parent': {
			sourceXml: searchXml,
			stage: async function createBay(tx) {
				const created = await tx.any.addChild(
					{ tagName: 'VoltageLevel', id: 'vl2' },
					{ tagName: 'Bay', namespace: V2019C1, attributes: { name: 'Feeder9' } },
				)
				return {
					params: { term: 'feeder9', tagNames: ['Bay'] },
					expected: [
						{
							tagName: 'Bay',
							id: created.id,
							title: 'Feeder9',
							ancestorIds: ['root', 's1', 'vl2'],
						},
					],
				}
			},
		},
		'a Bay renamed → found by its staged name': {
			sourceXml: searchXml,
			stage: async function renameBay(tx) {
				await tx.update({ tagName: 'Bay', id: 'bay2' }, { attributes: { name: 'Busbar' } })
				return {
					params: { term: 'b', tagNames: ['Bay'] },
					expected: [{ ...BAY2, title: 'Busbar' }],
				}
			},
		},
		'a Bay renamed → no longer found by its stored name': {
			sourceXml: searchXml,
			stage: async function renameBay(tx) {
				await tx.update({ tagName: 'Bay', id: 'bay2' }, { attributes: { name: 'Busbar' } })
				return { params: { term: 'feeder2', tagNames: ['Bay'] }, expected: [] }
			},
		},
		'a signal updated → its sibling named among the staged signals': {
			sourceXml: searchXml,
			stage: async function updateSignal(tx) {
				await tx.update(
					{ tagName: 'SourceRef', id: 'sr2' },
					{ attributes: { input: 'Close', inputInst: '1' } },
				)
				return {
					params: { term: 'trip', tagNames: ['SourceRef'] },
					expected: [
						{
							tagName: 'SourceRef',
							id: 'sr1',
							title: 'Trip',
							ancestorIds: ['root', 's1', 'vl1', 'bay1', 'f1', 'lnode1'],
						},
					],
				}
			},
		},
		'a Bay deleted → neither it nor what it held found': {
			sourceXml: searchXml,
			stage: async function deleteBay(tx) {
				await tx.delete({ tagName: 'Bay', id: 'bay1' })
				return {
					params: { term: 'feeder', tagNames: ['Bay', 'Label'] },
					expected: [BAY2, BAY3],
				}
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const found: { compared?: { hits: SearchHit[]; expected: SearchHit[] } } = {}
			await source.transaction(async function searchStaged(tx) {
				const { params, expected } = await testCase.stage(tx)
				const hits = await search(tx, params)
				found.compared = { hits: byId(hits), expected: byId(expected) }
			})
			expect(found.compared).toBeDefined()
			expect(found.compared?.hits).toEqual(found.compared?.expected)
		},
	})
})
