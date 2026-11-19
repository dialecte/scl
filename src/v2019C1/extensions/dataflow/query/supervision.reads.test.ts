import { all } from './all'
import dataPathsXml from './fixtures/data-paths-through-types.xml?raw'
import formsXml from './fixtures/supervision-reference-forms.xml?raw'
import { supervisionsOf } from './supervisions-of'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SupervisionRequest } from './supervisions-of.types'
import type { SclTest } from '@/v2019C1/test'

/** The store calls that read records, counted by the dev perf counters. */
const STORE_READS = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByAttributes',
	'core::store::getByDocumentId',
] as const

const B1 = { tagName: 'IED', id: 'ied-b1' } as const

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

type TestCase = SclTest.BaseXmlTestCase & { expected: { storeReads: number } }

/**
 * `all()` reads the supervision once: the DOI, DAI and Val of the LGOS / LSVS logical nodes the IED section holds,
 * three store reads whatever the number of dataflows; none when the document holds no LGOS / LSVS. The rest of
 * `all()` reads by tag, so its reads of children (`getMany`) are the supervision's alone.
 */
describe('dataflow supervision - the store reads of all()', () => {
	type AllTestCase = SclTest.BaseXmlTestCase & {
		expected: { storeReads: number; childReads: number }
	}

	const testCases: SclTest.TestCases<AllTestCase> = {
		'nine dataflows of GOOSE and SMV control blocks, nine LGOS / LSVS → 108 store reads, the 3 of the supervision its only reads of children':
			{
				// P1 publishes gcb1, gcb3, gcb11, svcb1 (LD0), gcb12, gcb13 (LD2) and gcb2, gcb7 (LD1, ldName FUNC1); B1 publishes gcbB and
				// holds an LGOS per reference form and an LSVS
				sourceXml: formsXml,
				expected: { storeReads: 108, childReads: 3 },
			},
		'a document without LGOS / LSVS → the reads of the dataflows alone, 126 and 1 of children, as before':
			{
				// eight SourceRefs with source paths through the data types, one ExtRef; no LGOS / LSVS
				sourceXml: dataPathsXml,
				expected: { storeReads: 126, childReads: 1 },
			},
	}

	runSclTestCases.withoutExport<AllTestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			source.perf.reset()
			await all(source.query)
			const report = source.perf.report()
			const storeReads = STORE_READS.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0)
			const childReads = report['core::store::getMany']?.count ?? 0
			expect({ storeReads, childReads }).toEqual(testCase.expected)
		},
	})
})

/** `supervisionsOf` reads the IED section and the supervision once, whatever the number of requests. */
describe('supervisionsOf - the store reads', () => {
	type RequestsTestCase = TestCase & { requests: readonly SupervisionRequest[] }

	const testCases: SclTest.TestCases<RequestsTestCase> = {
		'one request → 23 store reads: the IED section, then 3 for the supervision': {
			// P1 publishes gcb1, gcb3, gcb11, svcb1 (LD0), gcb12, gcb13 (LD2) and gcb2, gcb7 (LD1, ldName FUNC1); B1 publishes gcbB and
			// holds an LGOS per reference form and an LSVS
			sourceXml: formsXml,
			requests: [{ controlBlock: { tagName: 'GSEControl', id: 'gcb1' }, subscriber: B1 }],
			expected: { storeReads: 23 },
		},
		'four requests → as many reads as one': {
			// P1 publishes gcb1, gcb3, gcb11, svcb1 (LD0), gcb12, gcb13 (LD2) and gcb2, gcb7 (LD1, ldName FUNC1); B1 publishes gcbB and
			// holds an LGOS per reference form and an LSVS
			sourceXml: formsXml,
			requests: [
				{ controlBlock: { tagName: 'GSEControl', id: 'gcb1' }, subscriber: B1 },
				{ controlBlock: { tagName: 'GSEControl', id: 'gcb2' }, subscriber: B1 },
				{ controlBlock: { tagName: 'SampledValueControl', id: 'svcb1' }, subscriber: B1 },
				{ controlBlock: { tagName: 'GSEControl', id: 'gcb7' }, subscriber: B1 },
			],
			expected: { storeReads: 23 },
		},
	}

	runSclTestCases.withoutExport<RequestsTestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const { requests } = testCase
			const storeReads = await storeReadsOf({
				source,
				call: () => supervisionsOf(source.query, { requests }),
			})
			expect({ storeReads }).toEqual(testCase.expected)
		},
	})
})
