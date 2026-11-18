import aSmallBayAndALargeBay from './fixtures/a-small-bay-and-a-large-bay.xml?raw'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { updateRefPaths } from '@/v2019C1/hooks/after-updated/ref-paths'
import { withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'
import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/**
 * The tags a reference to an element of either bay may hold: a reference to the bay, its function category, functions,
 * sub functions, LNodes, connectivity nodes and conducting equipment (each element holding a uuid is a target).
 */
const REFERRER_TAGS_OF_A_BAY = [
	'ControlRef',
	'FunctionCatRef',
	'FunctionCategoryRef',
	'FunctionRef',
	'InputVar',
	'LNodeDataRef',
	'NeutralPoint',
	'OutputVar',
	'PowerSystemRelation',
	'ProcessEcho',
	'Resource',
	'SourceRef',
	'Terminal',
	'VariableApplyTo',
]

/** The reads of one element or one subtree, each counted. */
const PER_ELEMENT_READS = ['findAncestors', 'findDescendants', 'getTree'] as const

/** The reads of records by ref, one kind whatever the number of refs. */
const RECORD_READS = new Set(['getRecord', 'getRecords'])

/** The reads of every record of a tag, one kind: a search by attributes scans the tag as a read of it does. */
const TAG_SCANS = new Set(['findByAttributes', 'getRecordsByTagName'])

describe('the reads of an update following the paths below the updated element', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		bay: Scl.Ref<'Bay'>
		attributes: Record<string, string>
		/** The times each per-element read and a read of records by ref is called, and the tags scanned (sorted). */
		expected: {
			reads: Record<(typeof PER_ELEMENT_READS)[number] | 'recordReads', number>
			tagScans: string[]
		}
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// a-small-bay-and-a-large-bay.xml: B1 holds 8 elements, two of them named by a reference (F1, L1)
		'a bay of 8 elements renamed → its subtree and ancestors read once, each referrer tag scanned once':
			{
				sourceXml: aSmallBayAndALargeBay,
				bay: { tagName: 'Bay', id: 'b1' },
				attributes: { name: 'B9' },
				expected: {
					reads: { findAncestors: 1, findDescendants: 0, getTree: 1, recordReads: 0 },
					tagScans: REFERRER_TAGS_OF_A_BAY,
				},
			},
		// B2 holds 21 elements, the same two named by a reference: the reads do not grow with the elements
		'a bay of 21 elements renamed → the same reads as the bay of 8': {
			sourceXml: aSmallBayAndALargeBay,
			bay: { tagName: 'Bay', id: 'b2' },
			attributes: { name: 'B9' },
			expected: {
				reads: { findAncestors: 1, findDescendants: 0, getTree: 1, recordReads: 0 },
				tagScans: REFERRER_TAGS_OF_A_BAY,
			},
		},
		// no segment of a path changes: the bay itself is read, and the tags a reference to a bay may hold
		'a bay of 21 elements given a description → nothing below it read': {
			sourceXml: aSmallBayAndALargeBay,
			bay: { tagName: 'Bay', id: 'b2' },
			attributes: { desc: 'feeder' },
			expected: {
				reads: { findAncestors: 0, findDescendants: 0, getTree: 0, recordReads: 1 },
				tagScans: ['Resource', 'VariableApplyTo'],
			},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const bay = await source.query.getRecord(testCase.bay)
		if (!bay) throw new Error('bay missing')
		const raw = toRawRecord(bay) as Scl.RawRecord<Scl.ElementsOf>
		const values = Object.entries(testCase.attributes).map(([name, value]) => ({ name, value }))
		const renamed = {
			...raw,
			attributes: withAttributeValues(raw.attributes, values),
		} as Scl.RawRecord<Scl.ElementsOf>
		const counted = countDocumentQueryReads(source.query)
		await updateRefPaths({ query: counted.query, oldRecord: raw, newRecord: renamed })
		const calls = counted.calls()
		const reads = Object.fromEntries(
			PER_ELEMENT_READS.map((method) => [
				method,
				calls.filter((call) => call.method === method).length,
			]),
		)
		expect({
			reads: {
				...reads,
				recordReads: calls.filter((call) => RECORD_READS.has(call.method)).length,
			},
			tagScans: calls
				.filter((call) => TAG_SCANS.has(call.method))
				.map((call) => tagScanned(call.args[0]))
				.sort(),
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The tag a scan reads: the argument of a read by tag, the `tagName` of a search by attributes. */
function tagScanned(argument: unknown): string {
	return typeof argument === 'string' ? argument : String((argument as { tagName: string }).tagName)
}
