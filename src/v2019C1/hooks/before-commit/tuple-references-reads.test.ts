import connectionsAndAVendorCopy from './fixtures/connections-and-a-vendor-copy.xml?raw'
import { writeTupleReferencesAtCommit } from './tuple-references'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { updatedOperation, withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'
import { runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('the commit reads nothing for a transaction renaming no tuple target and writing no tuple reference', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		edited: Scl.Ref<Scl.ElementsOf>
		/** The description the transaction gives the element. */
		desc: string
		expectedReads: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's XCBR1, a tuple target: a description names nothing
		"a logical node's description edited → nothing read": {
			sourceXml: connectionsAndAVendorCopy,
			edited: { tagName: 'LN', id: 'xcbr7' },
			desc: 'feeder breaker',
			expectedReads: [],
		},
		// IED7's data set, no tuple target
		"a data set's description edited → nothing read": {
			sourceXml: connectionsAndAVendorCopy,
			edited: { tagName: 'DataSet', id: 'ds7' },
			desc: 'positions',
			expectedReads: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const record = await source.query.getRecord(testCase.edited)
		if (!record) throw new Error('edited record missing')
		const raw = toRawRecord(record)
		const operation = updatedOperation(
			raw,
			withAttributeValues(raw.attributes, [{ name: 'desc', value: testCase.desc }]),
		)
		const { query, reads } = countQueryReads(source.query)
		await writeTupleReferencesAtCommit({ operations: [operation], query, pending: new Map() })
		expect(reads).toEqual(testCase.expectedReads)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('the commit reads only the tags a change can reach', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		edited: Scl.Ref<Scl.ElementsOf>
		attributes: Record<string, string>
		/** The tags read by tag, sorted. */
		expectedTags: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's XCBR1 renumbered: only references naming a logical node or a control block it may hold are read
		'a logical node renamed → the referrer tags naming a logical node or a report read, no connection or address':
			{
				sourceXml: connectionsAndAVendorCopy,
				edited: { tagName: 'LN', id: 'xcbr7' },
				attributes: { inst: '5' },
				expectedTags: ['Association', 'ClientLN', 'ExtCtrl', 'ExtRef', 'FCDA', 'IEDName'],
			},
		// IED8's input pointed by names at IED8: its targets read, not the addresses below a connection
		"an input's IED name edited → the tags it may point at read, no address": {
			sourceXml: connectionsAndAVendorCopy,
			edited: { tagName: 'ExtRef', id: 'ext8' },
			attributes: { iedName: 'IED8' },
			expectedTags: ['GSEControl', 'LN', 'LN0', 'ReportControl', 'SampledValueControl'],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const record = await source.query.getRecord(testCase.edited)
		if (!record) throw new Error('edited record missing')
		const raw = toRawRecord(record)
		const values = Object.entries(testCase.attributes).map(([name, value]) => ({ name, value }))
		const operation = updatedOperation(raw, withAttributeValues(raw.attributes, values))
		const { query, calls } = countQueryReads(source.query)
		await writeTupleReferencesAtCommit({ operations: [operation], query, pending: new Map() })
		const tags = calls
			.filter((call) => call.method === 'getRecordsByTagName')
			.map((call) => String(call.args[0]))
			.sort()
		expect(tags).toEqual(testCase.expectedTags)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
