import twelveLNodesXml from './fixtures/twelve-lnodes-named-in-a-private.xml?raw'
import { readSpecNamings } from './read-spec-namings'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const V2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

/** The store calls that read records, counted by the dev perf counters. */
const STORE_READS = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByAttributes',
	'core::store::getByDocumentId',
] as const

/** The LNodes `ln0`… of the read-count fixture, each named `ln<i>-naming` in its Private. */
const MANY_LNODES = 12

/**
 * Four LNodes: `direct` named directly under it, `wrapped` named in its Private, `plain` with a Private but no naming,
 * `bare` with no child; the import names the last two (`IMPORTED`), as it names every LNode written without one.
 */
const FOUR_LNODES_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
		<Substation name="S1" ${ID}="sub-1">
			<Function name="F1" ${ID}="f1">
				<LNode lnClass="XCBR" lnInst="2" iedName="None" ${ID}="direct">
					<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${ID}="direct-naming"/>
				</LNode>
				<LNode lnClass="CSWI" lnInst="3" iedName="None" ${ID}="wrapped">
					<Private type="eIEC61850-6-100" ${ID}="wrapped-private">
						<eIEC61850-6-100:LNodeSpecNaming sLnClass="CSWI" sLnInst="1" ${ID}="wrapped-naming"/>
					</Private>
				</LNode>
				<LNode lnClass="PTRC" lnInst="1" iedName="None" ${ID}="plain">
					<Private type="other" ${ID}="plain-private"/>
				</LNode>
				<LNode lnClass="PTOC" lnInst="1" iedName="None" ${ID}="bare"/>
			</Function>
		</Substation>
	</SCL>`

type LNodeInput = { id: string; as: 'ref' | 'record' | 'raw record' }

/** An expected naming the import added: its id is generated, so it is not one of the fixture. */
const IMPORTED = 'imported'

/** The fixture's own naming ids; any other naming answered was added by the import. */
const FIXTURE_NAMINGS = new Set(['direct-naming', 'wrapped-naming'])

function lnodeRef(id: string): Scl.Ref<'LNode'> {
	return { tagName: 'LNode', id } as Scl.Ref<'LNode'>
}

async function readInputs(params: {
	query: Core.Query<Config>
	lnodes: readonly LNodeInput[]
}): Promise<Core.RefOrRecord<Config, 'LNode'>[]> {
	const { query } = params
	return Promise.all(
		params.lnodes.map(async function toInput({ id, as }) {
			if (as === 'ref') return lnodeRef(id)
			const record = await query.getRecord(lnodeRef(id))
			if (!record) throw new Error(`fixture LNode ${id} not found`)
			return as === 'record' ? record : toRawRecord(record)
		}),
	)
}

describe('readSpecNamings', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodes: LNodeInput[]
		/** The id of each input's naming, `IMPORTED` for one the import added, `undefined` for none. */
		expected: (string | undefined)[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode named directly under it, as a ref → its naming': {
			sourceXml: FOUR_LNODES_XML,
			lnodes: [{ id: 'direct', as: 'ref' }],
			expected: ['direct-naming'],
		},
		'an LNode named in its Private, as a record → its naming': {
			sourceXml: FOUR_LNODES_XML,
			lnodes: [{ id: 'wrapped', as: 'record' }],
			expected: ['wrapped-naming'],
		},
		'an LNode as a raw record → its naming': {
			sourceXml: FOUR_LNODES_XML,
			lnodes: [{ id: 'direct', as: 'raw record' }],
			expected: ['direct-naming'],
		},
		'LNodes written without a naming → the namings the import gave them': {
			sourceXml: FOUR_LNODES_XML,
			lnodes: [
				{ id: 'plain', as: 'ref' },
				{ id: 'bare', as: 'record' },
			],
			expected: [IMPORTED, IMPORTED],
		},
		'an LNode given twice, as a record and as a ref → its naming at both positions': {
			sourceXml: FOUR_LNODES_XML,
			lnodes: [
				{ id: 'wrapped', as: 'record' },
				{ id: 'wrapped', as: 'ref' },
			],
			expected: ['wrapped-naming', 'wrapped-naming'],
		},
		'a ref naming nothing → undefined': {
			sourceXml: FOUR_LNODES_XML,
			lnodes: [{ id: 'gone', as: 'ref' }],
			expected: [undefined],
		},
		'several LNodes → one entry each, in input order': {
			sourceXml: FOUR_LNODES_XML,
			lnodes: [
				{ id: 'wrapped', as: 'ref' },
				{ id: 'gone', as: 'ref' },
				{ id: 'direct', as: 'record' },
			],
			expected: ['wrapped-naming', undefined, 'direct-naming'],
		},
		'no LNode → no entry': {
			sourceXml: FOUR_LNODES_XML,
			lnodes: [],
			expected: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const query = source.query
			const lnodes = await readInputs({ query, lnodes: testCase.lnodes })
			const namings = await readSpecNamings(query, { lnodes })
			expect(
				namings.map(function namingIdOf(naming) {
					return naming && !FIXTURE_NAMINGS.has(naming.id) ? IMPORTED : naming?.id
				}),
			).toEqual(testCase.expected)
			expect(namings.every((naming) => !naming || naming.tagName === 'LNodeSpecNaming')).toBe(true)
		},
	})
})

describe('readSpecNamings - a ref naming another element', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expectedError: string }

	const testCases: SclTest.TestCases<TestCase> = {
		'a ref naming a Function as an LNode → refused with ELEMENT_TAGNAME_MISMATCH': {
			sourceXml: FOUR_LNODES_XML,
			expectedError: "Expected tagName 'LNode', got 'Function'",
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await expect(readSpecNamings(source.query, { lnodes: [lnodeRef('f1')] })).rejects.toThrow(
				testCase.expectedError,
			)
		},
	})
})

function lnodeRefs(count: number): Scl.Ref<'LNode'>[] {
	return Array.from({ length: count }, function refOfIndex(_, index) {
		return lnodeRef(`ln${index}`)
	})
}

/** The store reads of one `readSpecNamings` call, and how many of its entries are named. */
async function countReads(params: {
	source: {
		query: Core.Query<Config>
		perf: { reset(): void; report(): Partial<Record<string, { count?: number }>> }
	}
	lnodes: readonly Core.RefOrRecord<Config, 'LNode'>[]
}): Promise<{ storeReads: number; named: number }> {
	const { source, lnodes } = params
	source.perf.reset()
	const namings = await readSpecNamings(source.query, { lnodes })
	const report = source.perf.report()
	const storeReads = STORE_READS.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0)
	return { storeReads, named: namings.filter(Boolean).length }
}

/** The spec namings of many LNodes given as records cost the store reads of one: their Privates, then the namings. */
describe('readSpecNamings - the store reads of records', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		count: number
		expected: { storeReads: number; named: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'one LNode as a record → 2 store reads': {
			// twelve LNodes, each named in its Private
			sourceXml: twelveLNodesXml,
			count: 1,
			expected: { storeReads: 2, named: 1 },
		},
		[`${MANY_LNODES} LNodes as records → 2 store reads`]: {
			// twelve LNodes, each named in its Private
			sourceXml: twelveLNodesXml,
			count: MANY_LNODES,
			expected: { storeReads: 2, named: MANY_LNODES },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const records = await source.query.getRecords(lnodeRefs(testCase.count))
			const lnodes = records.flatMap((record) => (record ? [record] : []))
			const reads = await countReads({ source, lnodes })
			expect(reads).toEqual(testCase.expected)
		},
	})
})

/** Refs among the LNodes cost one more read, for all of them: the refs, then the Privates, then the namings. */
describe('readSpecNamings - the store reads of refs', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		count: number
		expected: { storeReads: number; named: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		[`${MANY_LNODES} LNodes as refs → 3 store reads`]: {
			// twelve LNodes, each named in its Private
			sourceXml: twelveLNodesXml,
			count: MANY_LNODES,
			expected: { storeReads: 3, named: MANY_LNODES },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const lnodes = lnodeRefs(testCase.count)
			const reads = await countReads({ source, lnodes })
			expect(reads).toEqual(testCase.expected)
		},
	})
})

/** Refs and records together cost the reads of refs: the refs, then the Privates, then the namings. */
describe('readSpecNamings - the store reads of refs and records together', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: string[]
		records: string[]
		expected: { storeReads: number; named: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'six LNodes as refs, six as records → 3 store reads': {
			// twelve LNodes, each named in its Private
			sourceXml: twelveLNodesXml,
			refs: ['ln0', 'ln1', 'ln2', 'ln3', 'ln4', 'ln5'],
			records: ['ln6', 'ln7', 'ln8', 'ln9', 'ln10', 'ln11'],
			expected: { storeReads: 3, named: MANY_LNODES },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const records = await source.query.getRecords(testCase.records.map(lnodeRef))
			const lnodes = [
				...testCase.refs.map(lnodeRef),
				...records.flatMap(function readOnly(record) {
					return record ? [record] : []
				}),
			]
			const reads = await countReads({ source, lnodes })
			expect(reads).toEqual(testCase.expected)
		},
	})
})

/** LNodes named directly, given as records, cost one read: their namings; no Private is looked into. */
describe('readSpecNamings - the store reads of direct namings', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		records: string[]
		expected: { storeReads: number; named: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode named directly under it, as a record → 1 store read': {
			sourceXml: FOUR_LNODES_XML,
			records: ['direct'],
			expected: { storeReads: 1, named: 1 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const records = await source.query.getRecords(testCase.records.map(lnodeRef))
			const lnodes = records.flatMap(function readOnly(record) {
				return record ? [record] : []
			})
			const reads = await countReads({ source, lnodes })
			expect(reads).toEqual(testCase.expected)
		},
	})
})

/** Inside a transaction, the staged creates and deletes answer: the naming as staged, not as stored. */
describe('readSpecNamings - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnode: string
		/** Stages the change; answers the id of the naming the LNode then has, `undefined` for none. */
		stage: (tx: Scl.Transaction) => Promise<string | undefined>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the naming of an LNode deleted in the transaction → undefined': {
			sourceXml: FOUR_LNODES_XML,
			lnode: 'direct',
			stage: async function deleteNaming(tx) {
				await tx.delete({ tagName: 'LNodeSpecNaming', id: 'direct-naming' })
				return undefined
			},
		},
		'a naming added to the LNode in the transaction → the staged naming': {
			sourceXml: FOUR_LNODES_XML,
			lnode: 'direct',
			stage: async function replaceNaming(tx) {
				await tx.delete({ tagName: 'LNodeSpecNaming', id: 'direct-naming' })
				const naming = await tx.addChild(lnodeRef('direct'), {
					tagName: 'LNodeSpecNaming',
					namespace: V2019C1,
					attributes: { sLnClass: 'XCBR', sLnInst: '5' },
				})
				return naming.id
			},
		},
		'a naming created in a Private created in the transaction → the staged naming': {
			sourceXml: FOUR_LNODES_XML,
			lnode: 'direct',
			stage: async function wrapNaming(tx) {
				await tx.delete({ tagName: 'LNodeSpecNaming', id: 'direct-naming' })
				const wrapper = await tx.addChild(lnodeRef('direct'), {
					tagName: 'Private',
					attributes: { type: 'eIEC61850-6-100' },
				})
				const naming = await tx.any.addChild(wrapper, {
					tagName: 'LNodeSpecNaming',
					namespace: V2019C1,
					attributes: { sLnClass: 'XCBR', sLnInst: '6' },
				})
				return naming.id
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const staged: { expected?: string; answered?: string } = {}
			await source.transaction(async function readStaged(tx) {
				staged.expected = await testCase.stage(tx)
				const [naming] = await readSpecNamings(tx, { lnodes: [lnodeRef(testCase.lnode)] })
				staged.answered = naming?.id
			})
			expect(staged.answered).toEqual(staged.expected)
		},
	})
})
