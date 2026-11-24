import behaviours from './fixtures/uuid-references/behaviours.xml?raw'
import { planUuidReferencesAtCommit } from './uuid-references'

import { toDialecteError } from '@dialecte/core'
import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { updatedOperation, withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'
import { runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('the reads of the commit checking the uuid references it writes', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** Each record updated by the commit's operations, with the attributes set (`''` removes one). */
		updates: { ref: Scl.Ref<Scl.ElementsOf>; attributes: Record<string, string> }[]
		/**
		 * How the check ends (`committed`, or the refusal's key), the attributes it writes (`name=value`), the tags looked up
		 * by uuid (sorted), and the times the ancestors are read.
		 */
		expected: { outcome: string; written: string[]; lookedUp: string[]; ancestorReads: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// behaviours.xml: the function F1 renamed, no reference written
		'no uuid reference written → nothing read': {
			sourceXml: behaviours,
			updates: [{ ref: { tagName: 'Function', id: 'f1' }, attributes: { name: 'F9' } }],
			expected: { outcome: 'committed', written: [], lookedUp: [], ancestorReads: 0 },
		},
		// stored-data names XCBR1 (an LNode), stored-control names CTL1 (a ControlRef): both keep their paths
		'two references rebound, each holding its path → nothing read': {
			sourceXml: behaviours,
			updates: [
				{ ref: { tagName: 'OutputVar', id: 'stored-data' }, attributes: { daName: 'q' } },
				{ ref: { tagName: 'OutputVar', id: 'stored-control' }, attributes: { outputUuid: 'ctl1' } },
			],
			expected: { outcome: 'committed', written: [], lookedUp: [], ancestorReads: 0 },
		},
		// stored-data and stored-no-do (given its doName) both rebound to CSWI1 of F2 with no path: two LNode uuids
		'two variables rebound with no path to LNodes → one LNode lookup, the ancestors read once': {
			sourceXml: behaviours,
			updates: [
				{
					ref: { tagName: 'OutputVar', id: 'stored-data' },
					attributes: { lnodeUuid: 'cswi', dataName: '' },
				},
				{
					ref: { tagName: 'InputVar', id: 'stored-no-do' },
					attributes: { lnodeUuid: 'cswi', dataName: '', doName: 'Pos' },
				},
			],
			expected: {
				outcome: 'REFERENCE_INCOHERENT',
				written: [],
				lookedUp: ['LNode'],
				ancestorReads: 1,
			},
		},
		// stored-data keeps XCBR1, in FB's reach, and loses its path: the commit writes it again
		'a variable in its reach left with no path → its path written, after one lookup and one ancestor read':
			{
				sourceXml: behaviours,
				updates: [
					{
						ref: { tagName: 'OutputVar', id: 'stored-data' },
						attributes: { daName: 'q', dataName: '' },
					},
				],
				expected: {
					outcome: 'committed',
					written: ['dataName=SF1/XCBR1.Pos.q'],
					lookedUp: ['LNode'],
					ancestorReads: 1,
				},
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const records = await Promise.all(
			testCase.updates.map(function readUpdated(update) {
				return source.query.getRecord(update.ref)
			}),
		)
		const operations = records.map(function updatedOf(record, index) {
			if (!record) throw new Error(`${testCase.updates[index].ref.id} missing`)
			return operationOf({
				record: toRawRecord(record),
				attributes: testCase.updates[index].attributes,
			})
		})
		const reads = countQueryReads(source.query)
		const written: string[] = []
		const outcome = await planUuidReferencesAtCommit({
			operations,
			query: reads.query,
			pending: new Map(),
			collect: false,
		}).then(
			function committed({ operations: staged }) {
				written.push(...staged.flatMap(writtenAttributesOf))
				return 'committed'
			},
			function refused(error: unknown) {
				return toDialecteError(error)?.key ?? String(error)
			},
		)
		expect({
			outcome,
			written,
			lookedUp: reads.calls
				.filter((call) => call.method === 'findByAttributes')
				.map((call) => String((call.args[0] as { tagName: string }).tagName))
				.sort(),
			ancestorReads: reads.calls.filter((call) => call.method === 'findAncestorsOfEach').length,
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The update of `record` setting `attributes` (`''` removes one). */
function operationOf(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	attributes: Record<string, string>
}): Scl.Operation {
	const { record, attributes } = params
	const values = Object.entries(attributes).map(([name, value]) => ({
		name,
		value: value === '' ? undefined : value,
	}))
	return updatedOperation(record, withAttributeValues(record.attributes, values))
}

/** The attributes an operation of the commit writes, as `name=value`. */
function writtenAttributesOf(operation: Scl.Operation): string[] {
	if (operation.status !== 'updated') return []
	const before = new Map(
		operation.oldRecord.attributes.map((attribute) => [attribute.name, attribute.value]),
	)
	return operation.newRecord.attributes
		.filter((attribute) => before.get(attribute.name) !== attribute.value)
		.map((attribute) => `${attribute.name}=${attribute.value}`)
}
