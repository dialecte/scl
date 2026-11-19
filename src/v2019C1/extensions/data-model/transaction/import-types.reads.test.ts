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

// Three LNodes, each with its own LNodeType -> DOType -> EnumType closure: nine types, three of each tag.
const THREE_CLOSURES_XML = /* xml */ `
	<SCL ${NS} ${ID}="scl-s">
		<Substation name="S1" ${ID}="sub-s">
			<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="L1" ${ID}="lnode-1"/>
			<LNode iedName="None" lnClass="CSWI" lnInst="2" lnType="L2" ${ID}="lnode-2"/>
			<LNode iedName="None" lnClass="CSWI" lnInst="3" lnType="L3" ${ID}="lnode-3"/>
		</Substation>
		<DataTypeTemplates ${ID}="dtt-s">
			<LNodeType id="L1" lnClass="CSWI" ${ID}="lnt-1"><DO name="Pos" type="D1" ${ID}="do-1"/></LNodeType>
			<LNodeType id="L2" lnClass="CSWI" ${ID}="lnt-2"><DO name="Pos" type="D2" ${ID}="do-2"/></LNodeType>
			<LNodeType id="L3" lnClass="CSWI" ${ID}="lnt-3"><DO name="Pos" type="D3" ${ID}="do-3"/></LNodeType>
			<DOType id="D1" cdc="ENS" ${ID}="dot-1"><DA name="stVal" bType="Enum" type="E1" fc="ST" ${ID}="da-1"/></DOType>
			<DOType id="D2" cdc="ENS" ${ID}="dot-2"><DA name="stVal" bType="Enum" type="E2" fc="ST" ${ID}="da-2"/></DOType>
			<DOType id="D3" cdc="ENS" ${ID}="dot-3"><DA name="stVal" bType="Enum" type="E3" fc="ST" ${ID}="da-3"/></DOType>
			<EnumType id="E1" ${ID}="et-1"><EnumVal ord="1" ${ID}="ev-1">one</EnumVal></EnumType>
			<EnumType id="E2" ${ID}="et-2"><EnumVal ord="2" ${ID}="ev-2">two</EnumVal></EnumType>
			<EnumType id="E3" ${ID}="et-3"><EnumVal ord="3" ${ID}="ev-3">three</EnumVal></EnumType>
		</DataTypeTemplates>
	</SCL>
`

// The target holds the three LNodes too, following the source's, each naming an old type of its own.
const THREE_FOLLOWERS_XML = /* xml */ `
	<SCL ${NS} ${ID}="scl-t">
		<Header id="target" ${ID}="header-t"/>
		<Substation name="S1" ${ID}="sub-t">
			<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="OLD" ${ID}="t-lnode-1"/>
			<LNode iedName="None" lnClass="CSWI" lnInst="2" lnType="OLD" ${ID}="t-lnode-2"/>
			<LNode iedName="None" lnClass="CSWI" lnInst="3" lnType="OLD" ${ID}="t-lnode-3"/>
		</Substation>
		<DataTypeTemplates ${ID}="dtt-t">
			<LNodeType id="OLD" lnClass="CSWI" ${ID}="t-lnt-old"><DO name="Beh" type="D1" ${ID}="t-do-old"/></LNodeType>
			<DOType id="D1" cdc="ENS" ${ID}="t-dot-1"><DA name="stVal" bType="Enum" type="E1" fc="ST" ${ID}="t-da-1"/></DOType>
			<EnumType id="E1" ${ID}="t-et-1"><EnumVal ord="9" ${ID}="t-ev-1">nine</EnumVal></EnumType>
		</DataTypeTemplates>
	</SCL>
`

// L1 names NEW (the content of the target's OLD) and OLD (other content): NEW comes first in the source.
const NEW_THEN_OLD_XML = /* xml */ `
	<SCL ${NS} ${ID}="scl-s">
		<Substation name="S1" ${ID}="sub-s">
			<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="L1" ${ID}="lnode-1"/>
		</Substation>
		<DataTypeTemplates ${ID}="dtt-s">
			<LNodeType id="L1" lnClass="CSWI" ${ID}="lnt-1">
				<DO name="Pos" type="NEW" ${ID}="do-pos"/>
				<DO name="Ind" type="OLD" ${ID}="do-ind"/>
			</LNodeType>
			<DOType id="NEW" cdc="DPC" ${ID}="dot-new"><DA name="stVal" bType="Dbpos" fc="ST" ${ID}="da-new"/></DOType>
			<DOType id="OLD" cdc="SPS" ${ID}="dot-old"><DA name="stVal" bType="BOOLEAN" fc="ST" ${ID}="da-old"/></DOType>
		</DataTypeTemplates>
	</SCL>
`

// The target's OLD holds the content of the source's NEW.
const OLD_AS_NEW_XML = /* xml */ `
	<SCL ${NS} ${ID}="scl-t">
		<Header id="target" ${ID}="header-t"/>
		<DataTypeTemplates ${ID}="dtt-t">
			<DOType id="OLD" cdc="DPC" ${ID}="t-dot-old"><DA name="stVal" bType="Dbpos" fc="ST" ${ID}="t-da-old"/></DOType>
		</DataTypeTemplates>
	</SCL>
`

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
		// The local store answers a lookup with a tag read: 17 (main 23)
		'nine types into an empty target → 12 lookups, 9 kept as they are (main 18 lookups)': {
			// the three closures, nothing in the target
			sourceXml: THREE_CLOSURES_XML,
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
						getByAttributes: 12,
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
						getByTagName: 17,
						'records.getByTagName': 28,
					},
				},
			},
		},
		// the target's OLD renamed NEW, so the source OLD finds its id free: the lookups see the rename, as on main
		'NEW reused and named so, then the source OLD → OLD kept, not forked (main the same, 10 lookups)':
			{
				// the target's OLD holds the source NEW's content; the source's OLD holds other content
				sourceXml: NEW_THEN_OLD_XML,
				targetXml: OLD_AS_NEW_XML,
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
							getByAttributes: 10,
							'records.getByAttributes': 7,
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
							getByTagName: 15,
							'records.getByTagName': 12,
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
		// main: 21 get, 46 lookups, 25 getMany; now the followers read in one getMany and the ids in one lookup per tag;
		// the same 69 records moved. The local store: 56 tag reads moving 46 records (main 62, 52)
		'three followers of nine types, D1 and E1 taken by other content → 2 forked and reclaimed, 18 get, 40 lookups, 26 getMany (main 21, 46, 25)':
			{
				// the target's LNodes follow the source's; its D1 and E1 hold other content, its OLD type only they name
				sourceXml: THREE_CLOSURES_XML,
				targetXml: THREE_FOLLOWERS_XML,
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
							getByAttributes: 40,
							'records.getByAttributes': 19,
							getByTagName: 16,
							'records.getByTagName': 12,
						},
						local: {
							get: 18,
							'records.get': 18,
							getMany: 26,
							'records.getMany': 32,
							getByAttributes: 0,
							'records.getByAttributes': 0,
							getByTagName: 56,
							'records.getByTagName': 46,
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
