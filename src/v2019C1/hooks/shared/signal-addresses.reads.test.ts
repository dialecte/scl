import sourceXml from './fixtures/lnode-inputs-naming-extrefs-by-uuid.xml?raw'
import { reconcileSignalAddresses, reconcileSignalAddressesOfLNodes } from './signal-addresses'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Config, Scl } from '@/v2019C1/config'
import type { CountedQueryCall } from '@/v2019C1/test/count-query-reads.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

/** The trip LNode bound to P1's PTRC1, as the binding hook leaves it. */
const BOUND = { iedName: 'P1', ldInst: 'LD0', lnUuid: 'ptrc1-uuid' }

/** The tag a query call reads by value or by tag, `undefined` for any other call. */
function tagOf(call: CountedQueryCall): string | undefined {
	const [first] = call.args
	if (call.method === 'getRecordsByTagName') return String(first)
	if (call.method === 'findByAttributes') return (first as { tagName: string }).tagName
	return undefined
}

/** What a signal-address verb wrote and read: the signals written with their address, the tags read, the lookups. */
type Observed = { written: string[]; tagReads: string[]; lookups: string[] }

type TestCase = SclTest.BaseXmlTestCase & {
	before?: (tx: Core.Transaction<Config>) => Promise<void>
	expected: Observed
}

/** A signal by its id, or `added` for the one a test added (its id is the store's), with the address it writes. */
function describeWritten(operation: Scl.Operation): string {
	const record = operation.newRecord!
	const name = record.id.startsWith('in-') ? record.id : 'added'
	const address = record.attributes.find((attribute) => attribute.name === 'extRefAddr')?.value
	return `${name}:${address ?? '-'}`
}

/**
 * Runs `reconcile` in a transaction on the trip LNode rebound to P1's PTRC1 (after `before`), and observes what it
 * writes and reads.
 */
async function observeRebinding(params: {
	source: Core.Document<Config>
	before: TestCase['before']
	reconcile: (params: {
		query: Core.Query<Config>
		oldRecord: Scl.RawRecord<Scl.ElementsOf>
		newRecord: Scl.RawRecord<Scl.ElementsOf>
	}) => Promise<Scl.Operation[]>
}): Promise<Observed> {
	const { source, before, reconcile } = params
	let observed: Observed | undefined
	await source.transaction(async function rebindTrip(tx) {
		await before?.(tx)
		const stored = await tx.getRecord({ tagName: 'LNode', id: 'trip' })
		const oldRecord = toRawRecord(stored!) as Scl.RawRecord<Scl.ElementsOf>
		const newRecord = {
			...oldRecord,
			attributes: [
				...oldRecord.attributes.filter((attribute) => !(attribute.name in BOUND)),
				...Object.entries(BOUND).map(([name, value]) => ({ name, value })),
			],
		} as Scl.RawRecord<Scl.ElementsOf>
		const { query, calls } = countDocumentQueryReads(tx)
		const operations = await reconcile({ query, oldRecord, newRecord })
		observed = {
			written: operations.map(describeWritten).sort(),
			tagReads: calls().flatMap((call) =>
				call.method === 'getRecordsByTagName' ? [String(tagOf(call))] : [],
			),
			lookups: calls().flatMap((call) =>
				call.method === 'findByAttributes' && tagOf(call) === 'ExtRef' ? ['ExtRef'] : [],
			),
		}
	})
	return observed!
}

/** Deletes the input B and adds one naming the ExtRef D. */
async function stageInputChanges(tx: Core.Transaction<Config>): Promise<void> {
	await tx.delete({ tagName: 'SourceRef', id: 'in-b' })
	await tx.addChild(
		{ tagName: 'LNodeInputs', id: 'trip-inputs' },
		{ tagName: 'SourceRef', attributes: { input: 'D', extRefUuid: 'ext-d' } },
	)
}

/**
 * The addresses of the signals of an LNode whose binding changes, written from the ExtRefs their uuids name: looked up
 * by value, one lookup whatever the number of signals.
 */
describe('reconcileSignalAddresses - the ExtRefs the signals of a rebound LNode name', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'three inputs naming an ExtRef → three written, one ExtRef lookup': {
			// the trip LNode's three inputs each name an ExtRef of P1 by uuid
			sourceXml,
			expected: {
				written: ['in-a:LD0/Q0GGIO1.A', 'in-b:LD0/Q0GGIO1.B', 'in-c:LD0/Q0GGIO1.C'],
				tagReads: [],
				lookups: ['ExtRef'],
			},
		},
		'an input added and one deleted in the transaction → the staged inputs written': {
			// the trip LNode's inputs B deleted, one naming the ExtRef D added
			sourceXml,
			before: stageInputChanges,
			expected: {
				written: ['added:LD0/Q0GGIO1.D', 'in-a:LD0/Q0GGIO1.A', 'in-c:LD0/Q0GGIO1.C'],
				tagReads: [],
				lookups: ['ExtRef'],
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const observed = await observeRebinding({
				source,
				before: testCase.before,
				reconcile: ({ query, oldRecord, newRecord }) =>
					reconcileSignalAddresses(query, { oldRecord, newRecord, pendingOperations: [] }),
			})
			expect(observed).toEqual(testCase.expected)
		},
	})
})

/**
 * The addresses of the signals of many rebound LNodes: their signals read under them (no whole signal tag read), the
 * ExtRefs they name looked up by value, one lookup whatever their number.
 */
describe('reconcileSignalAddressesOfLNodes - the signals of the LNodes given', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the trip LNode given → its three inputs written, the other LNode untouched, no tag read': {
			// the trip LNode's three inputs each name an ExtRef of P1 by uuid, the other LNode's input the fourth
			sourceXml,
			expected: {
				written: ['in-a:LD0/Q0GGIO1.A', 'in-b:LD0/Q0GGIO1.B', 'in-c:LD0/Q0GGIO1.C'],
				tagReads: [],
				lookups: ['ExtRef'],
			},
		},
		'an input added and one deleted in the transaction → the staged inputs written': {
			// the trip LNode's inputs B deleted, one naming the ExtRef D added
			sourceXml,
			before: stageInputChanges,
			expected: {
				written: ['added:LD0/Q0GGIO1.D', 'in-a:LD0/Q0GGIO1.A', 'in-c:LD0/Q0GGIO1.C'],
				tagReads: [],
				lookups: ['ExtRef'],
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const observed = await observeRebinding({
				source,
				before: testCase.before,
				reconcile: ({ query, oldRecord, newRecord }) =>
					reconcileSignalAddressesOfLNodes(query, {
						updates: [{ oldRecord, newRecord }],
						pendingOperations: [],
					}),
			})
			expect(observed).toEqual(testCase.expected)
		},
	})
})
