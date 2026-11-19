import { findMappedDataFollowingLn } from './find-mapped-data-following-ln'
import dataFollowingLnXml from './fixtures/data-following-ln.xml?raw'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = ALL_XMLNS_NAMESPACES

/** The store reads and the records they move, counted by the dev perf counters. */
const COUNTERS = ['get', 'getMany', 'getByTagName', 'getByAttributes'].flatMap(
	function countersOf(read) {
		return [`core::store::${read}`, `core::store::records.${read}`]
	},
)

// PTOC1 implements the one LNode of F1, which holds no data.
const ONE_LNODE_NO_DATA_XML = /* xml */ `
	<SCL ${NS} ${ID}="scl-1">
		<Substation ${ID}="sub" name="S1">
			<Function ${ID}="fn-1" name="F1">
				<LNode ${ID}="lnode-ptoc" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid"/>
			</Function>
		</Substation>
		<IED ${ID}="ied" name="VENDOR">
			<AccessPoint ${ID}="ap" name="AP1">
				<Server ${ID}="srv">
					<Authentication ${ID}="auth"/>
					<LDevice ${ID}="ld" inst="LD0">
						<LN0 ${ID}="ln0" lnClass="LLN0" inst="" lnType="LLN0_T"/>
						<LN ${ID}="ptoc1" lnClass="PTOC" inst="1" lnType="PTOC_T" uuid="ptoc1-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

const NO_TYPES = 'the logical nodes name types the document does not declare'

// The subtrees come from one walk, the rules answer from them: the store reads no longer grow with the data, and a
// root with no data under it reads no ancestors.
describe('findMappedDataFollowingLn - the store reads', () => {
	type Reads = Record<string, number>
	type TestCase = SclTest.BaseXmlTestCase & {
		expected: { inMemory: Reads; local: Reads }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// main: 22 get, 250 getMany, 12 lookups (each data climbed twice, each uuid looked up per data); now the 2
		// roots' subtrees and ancestors in one walk each, GGIO1's uuid looked up once. The local store answers a lookup
		// by attribute with a tag read.
		'PTOC1, 2 roots, 11 data → 18 getMany moving 32 records, 6 lookups, no get (main 22 get, 250 getMany moving 259, 12 lookups)':
			{
				// the LNode of F1 and the DOS Ind of F2 as roots, 11 data under them
				sourceXml: dataFollowingLnXml,
				allowIncoherentReferences: NO_TYPES,
				expected: {
					inMemory: {
						get: 0,
						'records.get': 0,
						getMany: 18,
						'records.getMany': 32,
						getByTagName: 10,
						'records.getByTagName': 13,
						getByAttributes: 6,
						'records.getByAttributes': 3,
					},
					local: {
						get: 0,
						'records.get': 0,
						getMany: 18,
						'records.getMany': 32,
						getByTagName: 16,
						'records.getByTagName': 27,
						getByAttributes: 0,
						'records.getByAttributes': 0,
					},
				},
			},
		// main: 4 getMany moving 4 records; the subtree of the one LNode holds no data, so no ancestor is read
		'PTOC1, 1 LNode with no data → 3 getMany moving 3 records, no ancestor walk (main 4, 4)': {
			// one LNode mapped to PTOC1 by its uuid, nothing under it
			sourceXml: ONE_LNODE_NO_DATA_XML,
			allowIncoherentReferences: NO_TYPES,
			expected: {
				inMemory: {
					get: 0,
					'records.get': 0,
					getMany: 3,
					'records.getMany': 3,
					getByTagName: 10,
					'records.getByTagName': 10,
					getByAttributes: 2,
					'records.getByAttributes': 0,
				},
				local: {
					get: 0,
					'records.get': 0,
					getMany: 3,
					'records.getMany': 3,
					getByTagName: 12,
					'records.getByTagName': 10,
					getByAttributes: 0,
					'records.getByAttributes': 0,
				},
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const ln = await source.query.getRecord({ tagName: 'LN', id: 'ptoc1' })
			source.perf.reset()
			await findMappedDataFollowingLn(source.query, { ln: ln as Scl.TrackedRecord<'LN' | 'LN0'> })
			const report = source.perf.report()
			const reads = Object.fromEntries(
				COUNTERS.map(function countOf(name) {
					return [name.replace('core::store::', ''), report[name]?.count ?? 0]
				}),
			)
			const store = typeof window === 'undefined' ? 'inMemory' : 'local'
			expect(reads).toEqual(testCase.expected[store])
		},
	})
})
