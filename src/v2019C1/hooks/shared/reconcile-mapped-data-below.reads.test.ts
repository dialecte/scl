import sourceXml from './fixtures/lnodes-with-data-naming-their-implementation.xml?raw'
import { reconcileMappedDataOfLNodes } from './reconcile-mapped-data-below'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

/** The breaker LNode released onto the specification IED's XCBR1, as the release hook leaves it. */
const RELEASED = {
	iedName: 'S_IED',
	ldInst: 'LD0',
	lnClass: 'XCBR',
	lnInst: '1',
	lnUuid: 's-breaker-uuid',
}

/** What the verb wrote and read: each data record written with the naming it keeps, the data tags read whole. */
type Observed = { written: string[]; tagReads: string[] }

type TestCase = SclTest.BaseXmlTestCase & {
	before?: (tx: Core.Transaction<Config>) => Promise<void>
	expected: Observed
}

/** A data record written, by id (`added` for the one a test added), with the naming attributes it keeps. */
function describeWritten(operation: Scl.Operation): string {
	const record = operation.newRecord!
	const name =
		record.id.startsWith('breaker-') || record.id.startsWith('other-') ? record.id : 'added'
	const attributes = record.attributes as readonly { name: string; value: string }[]
	const naming = attributes
		.filter((attribute) => attribute.name.startsWith('mapped'))
		.map((attribute) => `${attribute.name}=${attribute.value}`)
	return `${name}:${naming.join(',') || '-'}`
}

/**
 * The data below LNodes a hook released, stored in canonical form: read under the LNodes given, never the whole DOS,
 * SDS or DAS tag; data below other LNodes untouched.
 */
describe('reconcileMappedDataOfLNodes - the data below the LNodes given', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the breaker released onto the specification XCBR1 → its data written as before, no data tag read':
			{
				// the breaker's Beh names XCBR1 explicitly, its Pos by path only, its Health's stVal by uuid; the other LNode's Beh too
				sourceXml,
				expected: { written: ['breaker-beh:-'], tagReads: [] },
			},
		'a DOS added under the breaker in the transaction, one deleted → the staged data': {
			// the breaker's Pos deleted, a DOS naming XCBR1 explicitly added
			sourceXml,
			before: async (tx) => {
				await tx.delete({ tagName: 'DOS', id: 'breaker-pos' })
				const [priv] = await tx.getChildren({ tagName: 'LNode', id: 'breaker' }, 'Private')
				await tx.any.addChild(priv, {
					tagName: 'DOS',
					attributes: { name: 'Mod', mappedLnUuid: 's-breaker-uuid', mappedDoName: 'Mod' },
				})
			},
			expected: { written: ['added:-', 'breaker-beh:-'], tagReads: [] },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			let observed: Observed | undefined
			await source.transaction(async function releaseTheBreaker(tx) {
				await testCase.before?.(tx)
				const stored = await tx.getRecord({ tagName: 'LNode', id: 'breaker' })
				const lnode = toRawRecord(stored!) as Scl.RawRecord<Scl.ElementsOf>
				const released = {
					...lnode,
					attributes: [
						...lnode.attributes.filter(
							(attribute) => !(attribute.name in RELEASED) && attribute.name !== 'prefix',
						),
						...Object.entries(RELEASED).map(([name, value]) => ({ name, value })),
					],
				} as Scl.RawRecord<Scl.ElementsOf>
				const { query, calls } = countDocumentQueryReads(tx)
				const operations = await reconcileMappedDataOfLNodes(query, { lnodes: [released] })
				observed = {
					written: operations.map(describeWritten).sort(),
					tagReads: calls().flatMap((call) =>
						call.method === 'getRecordsByTagName' &&
						['DOS', 'SDS', 'DAS'].includes(String(call.args[0]))
							? [String(call.args[0])]
							: [],
					),
				}
			})
			expect(observed).toEqual(testCase.expected)
		},
	})
})
