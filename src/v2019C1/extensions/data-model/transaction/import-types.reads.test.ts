import aTwiceXml from './fixtures/import-types-a-twice.xml?raw'
import bThenAXml from './fixtures/import-types-b-then-a.xml?raw'
import newThenOldXml from './fixtures/import-types-new-then-old.xml?raw'
import oldAsNewXml from './fixtures/import-types-old-as-new.xml?raw'
import oneFollowerXml from './fixtures/import-types-one-follower.xml?raw'
import oneTypeXml from './fixtures/import-types-one-type.xml?raw'
import threeClosuresXml from './fixtures/import-types-three-closures.xml?raw'
import threeFollowersXml from './fixtures/import-types-three-followers.xml?raw'
import { importTypes } from './import-types'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { ImportTypesStats } from './import-types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = ALL_XMLNS_NAMESPACES

/** The target's store reads, counted by the dev perf counters. */
const COUNTERS = ['get', 'getMany', 'getByAttributes', 'getByTagName'].flatMap(
	function countersOf(read) {
		return [`core::store::${read}`, `core::store::records.${read}`]
	},
)

const EMPTY_TARGET_XML = /* xml */ `<SCL ${NS} ${ID}="scl-t"><Header id="target" ${ID}="header-t"/></SCL>`

type Reads = Record<string, number>

/** The counters of a perf report, without their prefix. */
function readsOf(report: Record<string, { count?: number } | undefined>): Reads {
	return Object.fromEntries(
		COUNTERS.map(function countOf(name) {
			return [name.replace('core::store::', ''), report[name]?.count ?? 0]
		}),
	)
}
type Answer = {
	remap: [string, string][]
	stats: ImportTypesStats
	reads: { inMemory: Reads; local: Reads }
}

describe('importTypes - the target lookups and reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		keepNameTypesFrom?: 'source' | 'target'
		expected: Answer
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// main: one lookup per type cloned (9); now one per type tag (3); the clones repointed from their clone mappings.
		// The local store answers a lookup with a tag read: 14 (main 23)
		'nine types into an empty target → 9 lookups, 9 kept as they are (main 18 lookups)': {
			// the three closures, nothing in the target
			sourceXml: threeClosuresXml,
			targetXml: EMPTY_TARGET_XML,
			expected: {
				remap: [
					['D1', 'D1'],
					['D2', 'D2'],
					['D3', 'D3'],
					['E1', 'E1'],
					['E2', 'E2'],
					['E3', 'E3'],
					['L1', 'L1'],
					['L2', 'L2'],
					['L3', 'L3'],
				],
				stats: { reused: 0, preserved: 9, forked: 0, reclaimed: 0 },
				reads: {
					inMemory: {
						get: 18,
						'records.get': 18,
						getMany: 21,
						'records.getMany': 25,
						getByAttributes: 9,
						'records.getByAttributes': 15,
						getByTagName: 5,
						'records.getByTagName': 1,
					},
					local: {
						get: 18,
						'records.get': 18,
						getMany: 21,
						'records.getMany': 25,
						getByAttributes: 0,
						'records.getByAttributes': 0,
						getByTagName: 14,
						'records.getByTagName': 28,
					},
				},
			},
		},
		// the target's OLD renamed NEW, so the source OLD finds its id free: the lookups see the rename, as on main
		'NEW reused and named so, then the source OLD → OLD kept, not forked (5 lookups, main 10: signature references by value list)':
			{
				// the target's OLD holds the source NEW's content; the source's OLD holds other content
				sourceXml: newThenOldXml,
				targetXml: oldAsNewXml,
				keepNameTypesFrom: 'source',
				expected: {
					remap: [
						['L1', 'L1'],
						['NEW', 'NEW'],
						['OLD', 'OLD'],
					],
					stats: { reused: 1, preserved: 2, forked: 0, reclaimed: 0 },
					reads: {
						inMemory: {
							get: 5,
							'records.get': 5,
							getMany: 10,
							'records.getMany': 14,
							getByAttributes: 5,
							'records.getByAttributes': 5,
							getByTagName: 5,
							'records.getByTagName': 2,
						},
						local: {
							get: 5,
							'records.get': 5,
							getMany: 10,
							'records.getMany': 14,
							getByAttributes: 0,
							'records.getByAttributes': 0,
							getByTagName: 10,
							'records.getByTagName': 7,
						},
					},
				},
			},
		// n = 1: one lookup by id, as on main
		'one type into an empty target → the reads of main, call for call': {
			// one LNodeType, nothing in the target
			sourceXml: oneTypeXml,
			targetXml: EMPTY_TARGET_XML,
			expected: {
				remap: [['L1', 'L1']],
				stats: { reused: 0, preserved: 1, forked: 0, reclaimed: 0 },
				reads: {
					inMemory: {
						get: 2,
						'records.get': 2,
						getMany: 1,
						'records.getMany': 1,
						getByAttributes: 1,
						'records.getByAttributes': 1,
						getByTagName: 5,
						'records.getByTagName': 1,
					},
					local: {
						get: 2,
						'records.get': 2,
						getMany: 1,
						'records.getMany': 1,
						getByAttributes: 0,
						'records.getByAttributes': 0,
						getByTagName: 6,
						'records.getByTagName': 2,
					},
				},
			},
		},
		// the first A renamed B; the second A still holds the id, so the source A is forked (then reclaims A), as on main.
		// The lookup before the loop finds A twice and leaves it to a lookup alone: one lookup and 2 records more than
		// main (12, 11 against 11, 9; 11, 11 since the signatures look their references up by value list), for a target no valid document is
		'B reused and named so, the target holding A twice → A forked as on main': {
			// the target's two DOTypes of id A hold the source B's content; the source's A holds other content
			allowInvalidFixture: {
				reason:
					'a target holding one type id twice: the case reads which type a lookup of that id finds',
				violations: [{ check: 'uniqueness', code: 'DOTypeKey' }],
			},
			sourceXml: bThenAXml,
			targetXml: aTwiceXml,
			keepNameTypesFrom: 'source',
			expected: {
				remap: [
					['A', 'A'],
					['B', 'B'],
					['L1', 'L1'],
				],
				stats: { reused: 1, preserved: 1, forked: 1, reclaimed: 1 },
				reads: {
					inMemory: {
						get: 5,
						'records.get': 5,
						getMany: 11,
						'records.getMany': 15,
						getByAttributes: 5,
						'records.getByAttributes': 5,
						getByTagName: 7,
						'records.getByTagName': 3,
					},
					local: {
						get: 5,
						'records.get': 5,
						getMany: 11,
						'records.getMany': 15,
						getByAttributes: 0,
						'records.getByAttributes': 0,
						getByTagName: 10,
						'records.getByTagName': 8,
					},
				},
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, target, testCase }) => {
			if (!target) throw new Error('the case needs a target')
			const records = await source.query.getRecordsByTagName('LNode')
			const answered: { answer?: Answer } = {}
			await target.transaction(async function importAll(tx) {
				target.perf.reset()
				const { idRemap, stats } = await importTypes(tx, {
					sourceQuery: source.query,
					records,
					keepNameTypesFrom: testCase.keepNameTypesFrom,
				})
				const store = typeof window === 'undefined' ? 'inMemory' : 'local'
				answered.answer = {
					remap: [...idRemap].sort(),
					stats,
					reads: { ...testCase.expected.reads, [store]: readsOf(target.perf.report()) },
				}
			})
			expect(answered.answer).toEqual(testCase.expected)
		},
	})
})

// The target's three LNodes follow the source's: each takes the type its source names, read together.
describe('importTypes - the followers read together', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string; expected: Answer }

	const testCases: SclTest.TestCases<TestCase> = {
		// main: 21 get, 22 lookups, 25 getMany; now the followers read in one getMany and the ids in one lookup per tag;
		// the same 69 records moved. The local store: 21 tag reads moving 36 records (main 38, 52)
		'three followers of nine types, D1 and E1 taken by other content → 2 forked and reclaimed, 18 get, 9 lookups, 26 getMany (main 21, 22, 25)':
			{
				// the target's LNodes follow the source's; its D1 and E1 hold other content, its OLD type only they name
				sourceXml: threeClosuresXml,
				targetXml: threeFollowersXml,
				expected: {
					remap: [
						['D1', 'D1'],
						['D2', 'D2'],
						['D3', 'D3'],
						['E1', 'E1'],
						['E2', 'E2'],
						['E3', 'E3'],
						['L1', 'L1'],
						['L2', 'L2'],
						['L3', 'L3'],
					],
					stats: { reused: 0, preserved: 7, forked: 2, reclaimed: 2 },
					reads: {
						inMemory: {
							get: 18,
							'records.get': 18,
							getMany: 26,
							'records.getMany': 32,
							getByAttributes: 9,
							'records.getByAttributes': 15,
							getByTagName: 12,
							'records.getByTagName': 9,
						},
						local: {
							get: 18,
							'records.get': 18,
							getMany: 26,
							'records.getMany': 32,
							getByAttributes: 0,
							'records.getByAttributes': 0,
							getByTagName: 21,
							'records.getByTagName': 36,
						},
					},
				},
			},
		// n = 1: the follower read in one getMany instead of one get: 5 calls moving 5 records, as on main
		'one follower of one type → the calls and records of main': {
			// the target's LNode follows the source's, its old type only it names
			sourceXml: oneTypeXml,
			targetXml: oneFollowerXml,
			expected: {
				remap: [['L1', 'L1']],
				stats: { reused: 0, preserved: 1, forked: 0, reclaimed: 0 },
				reads: {
					inMemory: {
						get: 2,
						'records.get': 2,
						getMany: 3,
						'records.getMany': 3,
						getByAttributes: 1,
						'records.getByAttributes': 1,
						getByTagName: 8,
						'records.getByTagName': 3,
					},
					local: {
						get: 2,
						'records.get': 2,
						getMany: 3,
						'records.getMany': 3,
						getByAttributes: 0,
						'records.getByAttributes': 0,
						getByTagName: 9,
						'records.getByTagName': 4,
					},
				},
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, target, testCase }) => {
			if (!target) throw new Error('the case needs a target')
			const lnodes = await source.query.getRecordsByTagName('LNode')
			const followers = lnodes.map(function followerOf(lnode, index) {
				return {
					source: lnode,
					target: { tagName: 'LNode', id: `t-lnode-${index + 1}` } as Scl.Ref<'LNode'>,
				}
			})
			const answered: { answer?: Answer } = {}
			await target.transaction(async function importFollowed(tx) {
				target.perf.reset()
				const { idRemap, stats } = await importTypes(tx, {
					sourceQuery: source.query,
					records: [],
					followers,
				})
				const store = typeof window === 'undefined' ? 'inMemory' : 'local'
				answered.answer = {
					remap: [...idRemap].sort(),
					stats,
					reads: { ...testCase.expected.reads, [store]: readsOf(target.perf.report()) },
				}
			})
			expect(answered.answer).toEqual(testCase.expected)
		},
	})
})
