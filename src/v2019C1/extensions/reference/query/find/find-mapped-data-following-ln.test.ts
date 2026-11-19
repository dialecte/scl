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
const EXTENSION_PREFIX = 'eIEC61850-6-100'

/** The store reads, counted by the dev perf counters. */
const READS = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByAttributes',
]

// A DOS of the LNode sits in a vendor element of its Private: its parent is not among the data read.
const WRAPPED_DATA_XML = /* xml */ `
	<SCL ${NS} xmlns:vendor="urn:vendor" ${ID}="scl-1">
		<Substation ${ID}="sub" name="S1">
			<Function ${ID}="fn-1" name="F1">
				<LNode ${ID}="lnode-ptoc" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
					<Private ${ID}="priv-ptoc" type="${EXTENSION_PREFIX}">
						<${EXTENSION_PREFIX}:DOS ${ID}="dos-op" name="Op"/>
						<vendor:Wrap ${ID}="wrap">
							<${EXTENSION_PREFIX}:DOS ${ID}="dos-wrapped" name="Str">
								<${EXTENSION_PREFIX}:DAS ${ID}="das-wrapped" name="q"/>
							</${EXTENSION_PREFIX}:DOS>
						</vendor:Wrap>
					</Private>
				</LNode>
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

const NO_TYPES = 'the data name data of logical node types the document does not declare'

describe('findMappedDataFollowingLn', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ln: Scl.Ref<'LN' | 'LN0'>
		expected: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'PTOC1 → per root, per tag (DAS, DOS, SDS) in id order: its LNode data but the DOS naming GGIO1 and its child, then the children of the DOS of F2 naming it':
			{
				// PTOC1 implements the LNode of F1, the DOS Ind of F2 names it; Beh of F1 names GGIO1
				sourceXml: dataFollowingLnXml,
				allowIncoherentReferences: NO_TYPES,
				ln: { tagName: 'LN', id: 'ptoc1' },
				expected: [
					'das-deep',
					'das-general',
					'das-q',
					'dos-op',
					'dos-str',
					'dos-sub',
					'sds-sub',
					'das-under',
					'das-under-deep',
					'sds-under',
				],
			},
		'GGIO1 → its LNode data by default and the child of the DOS of F1 naming it': {
			// GGIO1 implements the LNode of F2; Beh of F1 names it
			sourceXml: dataFollowingLnXml,
			allowIncoherentReferences: NO_TYPES,
			ln: { tagName: 'LN', id: 'ggio1' },
			expected: ['dos-ggio', 'das-else'],
		},
		'PTOC1, a DOS in a vendor element of the Private → it and its DAS follow it too': {
			sourceXml: WRAPPED_DATA_XML,
			allowIncoherentReferences: NO_TYPES,
			ln: { tagName: 'LN', id: 'ptoc1' },
			expected: ['das-wrapped', 'dos-op', 'dos-wrapped'],
		},
		'the LN0, named by nothing → none': {
			// no LNode and no data names the LN0
			sourceXml: dataFollowingLnXml,
			allowIncoherentReferences: NO_TYPES,
			ln: { tagName: 'LN0', id: 'ln0' },
			expected: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const ln = await source.query.getRecord(testCase.ln)
			const found = await findMappedDataFollowingLn(source.query, {
				ln: ln as Scl.TrackedRecord<'LN' | 'LN0'>,
			})
			expect(found.map((record) => record.id)).toEqual(testCase.expected)
		},
	})
})

// Inside a transaction: Op now names GGIO1, Sub deleted, a DAS created under Str.
describe('findMappedDataFollowingLn - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: (created: string) => string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'PTOC1 → the staged data following it': {
			// the writes of the transaction below, then PTOC1 asked
			sourceXml: dataFollowingLnXml,
			allowIncoherentReferences: NO_TYPES,
			expected: (created) => [
				created,
				'das-q',
				'dos-str',
				'das-under',
				'das-under-deep',
				'sds-under',
			],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const answered: { found: string[]; expected: string[] } = { found: [], expected: [] }
			await source.transaction(async function findStaged(tx) {
				await tx.update(
					{ tagName: 'DOS', id: 'dos-op' },
					{ attributes: { mappedLnUuid: 'ggio1-uuid' } },
				)
				await tx.delete({ tagName: 'DOS', id: 'dos-sub' })
				const created = await tx.addChild(
					{ tagName: 'DOS', id: 'dos-str' },
					{ tagName: 'DAS', attributes: { name: 't' } },
				)
				const ln = await tx.getRecord({ tagName: 'LN', id: 'ptoc1' })
				const found = await findMappedDataFollowingLn(tx, {
					ln: ln as Scl.TrackedRecord<'LN' | 'LN0'>,
				})
				answered.found = found.map((record) => record.id)
				answered.expected = testCase.expected(created.id)
			})
			expect(answered.found).toEqual(answered.expected)
		},
	})
})

// The subtrees come from one walk, the rules answer from them: the store reads no longer grow with the data.
describe('findMappedDataFollowingLn - the store reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		expected: { inMemory: Record<string, number>; local: Record<string, number> }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// main: 22 get, 250 getMany, 10 tag reads, 12 lookups by attribute (each data climbed twice, each uuid looked up
		// per data); now the 2 roots' subtrees and ancestors in one walk each, GGIO1's uuid looked up once. The local
		// store answers a lookup by attribute with a tag read.
		'PTOC1, 2 roots, 11 data → 18 getMany, 10 tag reads, 6 lookups, no get (main 22, 250, 10, 12)':
			{
				// the LNode of F1 and the DOS Ind of F2 as roots, 11 data under them
				sourceXml: dataFollowingLnXml,
				allowIncoherentReferences: NO_TYPES,
				expected: {
					inMemory: { get: 0, getMany: 18, getByTagName: 10, getByAttributes: 6 },
					local: { get: 0, getMany: 18, getByTagName: 16, getByAttributes: 0 },
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
				READS.map(function countOf(name) {
					return [name.replace('core::store::', ''), report[name]?.count ?? 0]
				}),
			)
			const store = typeof window === 'undefined' ? 'inMemory' : 'local'
			expect(reads).toEqual(testCase.expected[store])
		},
	})
})
