import { all } from './all'
import withoutSignalsXml from './fixtures/implementation-only-lnodes-without-signals.xml?raw'
import implementationOnlyXml from './fixtures/implementation-only-lnodes.xml?raw'

import { describe, expect } from 'vitest'

import { resolveMappedLNodes } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes'
import { runSclTestCases } from '@/v2019C1/test'

import type { ImplementationOnlyDataflow } from '../dataflow.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

/** The store calls that read records, counted by the dev perf counters. */
const STORE_READS = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByAttributes',
	'core::store::getByDocumentId',
] as const

/**
 * P1 publishes gcb1 and holds PTRC 1 (two LNodes mapped by names), CSWI 1 (an LNode mapped by lnUuid) and MMXU 1
 * (none); B1 subscribes from XCBR 1 (mapped by names), GGIO 1 (mapped by lnUuid) and TCTR 1 (none); one open SourceRef.
 */
const FIXTURE = { sourceXml: implementationOnlyXml }

/** The store reads of one call, counted over a fresh perf report. */
async function storeReadsOf(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
	call: () => Promise<unknown>
}): Promise<number> {
	const { source, call } = params
	source.perf.reset()
	await call()
	const report = source.perf.report()
	return STORE_READS.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0)
}

/** A list of LNode refs by id. */
function lnodes(...ids: string[]): { tagName: 'LNode'; id: string }[] {
	return ids.map((id) => ({ tagName: 'LNode', id }))
}

/** The LNodes `all()` gives the implementation-only dataflow of the ExtRef. */
async function lnodesOfExtRef(params: {
	query: Core.Query<Config>
	extRef: string
}): Promise<ImplementationOnlyDataflow['lnodes'] | undefined> {
	const { query, extRef } = params
	const dataflows = await all(query)
	const dataflow = dataflows.find(
		(candidate): candidate is ImplementationOnlyDataflow =>
			candidate.kind === 'implementation-only' && candidate.element.id === extRef,
	)
	return dataflow?.lnodes
}

/**
 * An implementation-only dataflow names the LNodes of the specification on both of its ends: those mapped to the
 * logical node its ExtRef's signal names (the sender), and to the one holding the ExtRef (the subscriber).
 */
describe('all - the LNodes of an implementation-only dataflow', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		extRef: string
		expected: ImplementationOnlyDataflow['lnodes']
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'sender named by names, two LNodes mapped to it → both in document order, the subscriber LNode':
			{
				...FIXTURE,
				extRef: 'ext-by-names',
				expected: {
					sender: lnodes('lnode-ptrc', 'lnode-ptrc-twin'),
					subscriber: lnodes('lnode-xcbr'),
				},
			},
		'sender named by lnUuid, its LNode mapped by lnUuid → that LNode': {
			...FIXTURE,
			extRef: 'ext-by-ln-uuid',
			expected: { sender: lnodes('lnode-cswi-by-uuid'), subscriber: lnodes('lnode-xcbr') },
		},
		'subscriber LN mapped by lnUuid → its LNode': {
			...FIXTURE,
			extRef: 'ext-in-ggio',
			expected: {
				sender: lnodes('lnode-ptrc', 'lnode-ptrc-twin'),
				subscriber: lnodes('lnode-ggio-by-uuid'),
			},
		},
		'no LNode mapped to the sender → an empty sender side': {
			...FIXTURE,
			extRef: 'ext-sender-unmapped',
			expected: { sender: [], subscriber: lnodes('lnode-xcbr') },
		},
		'a sender logical node not in the document → an empty sender side': {
			...FIXTURE,
			extRef: 'ext-sender-missing',
			expected: { sender: [], subscriber: lnodes('lnode-xcbr') },
		},
		'no LNode mapped to the subscriber → an empty subscriber side': {
			...FIXTURE,
			extRef: 'ext-subscriber-unmapped',
			expected: { sender: lnodes('lnode-ptrc', 'lnode-ptrc-twin'), subscriber: [] },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const found = await lnodesOfExtRef({ query: source.query, extRef: testCase.extRef })
			expect(found).toEqual(testCase.expected)
		},
	})
})

/** Inside a transaction the LNodes follow the staged mapping. */
describe('all - the LNodes of an implementation-only dataflow, inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		extRef: string
		/** Staged before the call, in the transaction it runs in. */
		stage: (tx: Core.Transaction<Config>) => Promise<void>
		expected: ImplementationOnlyDataflow['lnodes']
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode renamed onto the unmapped sender, the subscriber LNode assigned to no IED → the staged mapping':
			{
				...FIXTURE,
				extRef: 'ext-sender-unmapped',
				stage: async (tx) => {
					await tx.update(
						{ tagName: 'LNode', id: 'lnode-ptrc-twin' },
						{ attributes: { lnClass: 'MMXU' } },
					)
					await tx.update(
						{ tagName: 'LNode', id: 'lnode-xcbr' },
						{ attributes: { iedName: 'None' } },
					)
				},
				expected: { sender: lnodes('lnode-ptrc-twin'), subscriber: [] },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const found = await source.transaction(async (tx) => {
				await testCase.stage(tx)
				return lnodesOfExtRef({ query: tx, extRef: testCase.extRef })
			})
			expect(found).toEqual(testCase.expected)
		},
	})
})

/** A document of signals reads the mapping of the LNodes for its allocation already: its LNodes cost no more read. */
describe('all - the store reads of the LNodes of implementation-only dataflows', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: { storeReads: number } }

	const testCases: SclTest.TestCases<TestCase> = {
		'one open signal and six implementation-only dataflows → 115 store reads, as many as without the LNodes':
			{
				...FIXTURE,
				expected: { storeReads: 115 },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const storeReads = await storeReadsOf({ source, call: () => all(source.query) })
			expect({ storeReads }).toEqual(testCase.expected)
		},
	})
})

/**
 * A document whose only dataflows are implementation-only reads the LNode mapping once for them: its reads are those of
 * the dataflows alone (105, as before) and those of one read of the mapping.
 */
describe('all - the store reads of the LNodes of implementation-only dataflows, without signals', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodes: readonly string[]
		expected: { storeReads: number; mappingReads: number; readsBesideTheMapping: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'six implementation-only dataflows and no signal → 115 store reads: 105 as before, 10 for the LNode mapping read once':
			{
				// the same document without its SourceRef: nothing read the LNode mapping before
				sourceXml: withoutSignalsXml,
				lnodes: [
					'lnode-ptrc',
					'lnode-ptrc-twin',
					'lnode-cswi-by-uuid',
					'lnode-xcbr',
					'lnode-ggio-by-uuid',
				],
				expected: { storeReads: 115, mappingReads: 10, readsBesideTheMapping: 105 },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const storeReads = await storeReadsOf({ source, call: () => all(source.query) })
			const lnodeRefs = testCase.lnodes.map((id): Scl.Ref<'LNode'> => ({ tagName: 'LNode', id }))
			const mappingReads = await storeReadsOf({
				source,
				call: () => resolveMappedLNodes(source.query, { lnodes: lnodeRefs }),
			})
			const readsBesideTheMapping = storeReads - mappingReads
			expect({ storeReads, mappingReads, readsBesideTheMapping }).toEqual(testCase.expected)
		},
	})
})
