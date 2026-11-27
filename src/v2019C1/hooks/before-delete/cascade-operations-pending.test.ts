import breakerSubscribedAndControlledMoved from './fixtures/breaker-subscribed-and-controlled-moved.xml?raw'
import breakerSubscribedAndControlled from './fixtures/breaker-subscribed-and-controlled.xml?raw'
import { buildCascadeOperations, collectDeleteCascade } from './orphaned-refs'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe("the commit pass's cascade builds on what the commit's other operations write", () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The records as the commit's other operations write them, read from this document by id. */
		targetXml: string
		written: Scl.Ref<Scl.ElementsOf>[]
		deleted: Scl.Ref<Scl.ElementsOf>
		/** Per record id, attributes its final update holds. */
		expected: Record<string, Record<string, string>>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's breaker named by the stVal entry of DS (sent by the GOOSE GC, confRev 1) and IED8's input; the commit
		// writes the input moved to posMoved and the GOOSE described
		'the breaker deleted while the commit moves the input and describes the GOOSE → the input cleared from its new address, the GOOSE raised from its new description':
			{
				sourceXml: breakerSubscribedAndControlled,
				targetXml: breakerSubscribedAndControlledMoved,
				written: [
					{ tagName: 'ExtRef', id: 'ext8' },
					{ tagName: 'GSEControl', id: 'gc7' },
				],
				deleted: { tagName: 'LN', id: 'xcbr7' },
				expected: {
					ext8: { intAddr: 'posMoved' },
					gc7: { desc: 'position GOOSE', confRev: '10001' },
				},
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const { query } = source
		const root = await query.getRecord(testCase.deleted)
		if (!root) throw new Error('deleted record missing')
		const written = await target.query.getRecords(testCase.written)
		const pending = new Map(
			written.flatMap((record) => (record ? [[record.id, toRawRecord(record)] as const] : [])),
		)
		const cascade = await collectDeleteCascade(query, {
			roots: [toRawRecord(root)],
			emptiesContainers: false,
		})
		const operations = await buildCascadeOperations(query, {
			cascade,
			deletedRoots: [root],
			pending,
		})
		expect(finalAttributes({ operations, expected: testCase.expected })).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** Per record id expected, the attributes its last update holds, among those expected. */
function finalAttributes(params: {
	operations: readonly Scl.Operation[]
	expected: Record<string, Record<string, string>>
}): Record<string, Record<string, string>> {
	const { operations, expected } = params
	return Object.fromEntries(
		Object.entries(expected).map(([id, attributes]) => {
			const last = operations
				.filter((operation) => operation.status === 'updated' && operation.newRecord.id === id)
				.at(-1)
			const held =
				last?.status === 'updated'
					? Object.fromEntries(
							last.newRecord.attributes
								.filter((attribute) => attribute.name in attributes)
								.map((attribute) => [attribute.name, attribute.value]),
						)
					: {}
			return [id, held]
		}),
	)
}
