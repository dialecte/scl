import { countReads, NAMING_NOTHING, readReferrers } from './__tests__/reference-paths'
import mixedXml from './fixtures/reference-paths-mixed.xml?raw'
import signalsXml from './fixtures/signals-mixed.xml?raw'
import { resolveReferencePath, resolveReferencePaths } from './resolve-reference-path'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * The store reads, the same on every store, and the records moved on each store: the node project runs on the
 * in-memory store, the browser one on the local store, each counting what a value lookup moves its own way.
 */
type ExpectedReads = { storeReads: number; recordsMoved: { inMemory: number; local: number } }

type TestCase = SclTest.BaseXmlTestCase & {
	refs: Scl.Ref<Scl.ElementsOf>[]
	pathAttribute: string
	/** The referrers without their uuid companions: the path is searched. */
	byPath: boolean
	expected: ExpectedReads
}

/**
 * One record costs no more than before (main's reads and records in each name): the same reads on every path that
 * reaches no signal search, fewer where a resolve read the same thing twice, and far fewer in the signal search (each
 * signal tag read once, a path built only for a signal a key can name).
 */
describe('resolveReferencePath - the store reads of one record', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'SourceRef sr-uuid.source as imported → 1 reads, 1 records (main the same); local store 7 records':
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [{ tagName: 'SourceRef', id: 'sr-uuid' }],
				pathAttribute: 'source',
				byPath: false,
				expected: { storeReads: 1, recordsMoved: { inMemory: 1, local: 7 } },
			},
		'SourceRef sr-b2.source by path → 15 reads, 33 records (main the same)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'SourceRef', id: 'sr-b2' }],
			pathAttribute: 'source',
			byPath: true,
			expected: { storeReads: 15, recordsMoved: { inMemory: 33, local: 33 } },
		},
		'SourceRef sr-spec.source by path → 9 reads, 27 records (main the same)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'SourceRef', id: 'sr-spec' }],
			pathAttribute: 'source',
			byPath: true,
			expected: { storeReads: 9, recordsMoved: { inMemory: 27, local: 27 } },
		},
		'SourceRef sr-stale.source by path → 3 reads, 21 records (main the same)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'SourceRef', id: 'sr-stale' }],
			pathAttribute: 'source',
			byPath: true,
			expected: { storeReads: 3, recordsMoved: { inMemory: 21, local: 21 } },
		},
		'ControlRef cr-oper.extCtrlAddr by path → 20 reads, 21 records (main the same)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'ControlRef', id: 'cr-oper' }],
			pathAttribute: 'extCtrlAddr',
			byPath: true,
			expected: { storeReads: 20, recordsMoved: { inMemory: 21, local: 21 } },
		},
		'SourceRef sr-uuid.resourceName by path → 20 reads, 20 records (main 29, 29: the ancestors of the referrer read once, was twice)':
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [{ tagName: 'SourceRef', id: 'sr-uuid' }],
				pathAttribute: 'resourceName',
				byPath: true,
				expected: { storeReads: 20, recordsMoved: { inMemory: 20, local: 20 } },
			},
		'FunctionalVariantRef fvref-1.functionalVariant by path → 10 reads, 11 records (main the same)':
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [{ tagName: 'FunctionalVariantRef', id: 'fvref-1' }],
				pathAttribute: 'functionalVariant',
				byPath: true,
				expected: { storeReads: 10, recordsMoved: { inMemory: 11, local: 11 } },
			},
		'LNodeInputRef in-ref-1.sourceRef by path → 23 reads, 31 records (main 37, 46: the FunctionRef and its target read once, was again per step); local store 32 records (main 47)':
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [{ tagName: 'LNodeInputRef', id: 'in-ref-1' }],
				pathAttribute: 'sourceRef',
				byPath: true,
				expected: { storeReads: 23, recordsMoved: { inMemory: 31, local: 32 } },
			},
		'LNodeDataRef data-ref-1.data by path → 18 reads, 36 records (main the same); local store 37 records':
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [{ tagName: 'LNodeDataRef', id: 'data-ref-1' }],
				pathAttribute: 'data',
				byPath: true,
				expected: { storeReads: 18, recordsMoved: { inMemory: 36, local: 37 } },
			},
		'FunctionCatRef fcatref-sub.function by path → 8 reads, 9 records (main the same)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'FunctionCatRef', id: 'fcatref-sub' }],
			pathAttribute: 'function',
			byPath: true,
			expected: { storeReads: 8, recordsMoved: { inMemory: 9, local: 9 } },
		},
		'FunctionCatRef fcatref-none.function by path → 12 reads, 13 records (main the same)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'FunctionCatRef', id: 'fcatref-none' }],
			pathAttribute: 'function',
			byPath: true,
			expected: { storeReads: 12, recordsMoved: { inMemory: 13, local: 13 } },
		},
		'DOS dos-1.mappedDoName as imported → 25 reads, 24 records (main 26, 25)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'DOS', id: 'dos-1' }],
			pathAttribute: 'mappedDoName',
			byPath: false,
			expected: { storeReads: 25, recordsMoved: { inMemory: 24, local: 24 } },
		},
		'InputVar iv-name.dataName by path → 20 reads, 38 records (main the same)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'InputVar', id: 'iv-name' }],
			pathAttribute: 'dataName',
			byPath: true,
			expected: { storeReads: 20, recordsMoved: { inMemory: 38, local: 38 } },
		},
		'InputVar iv-name.inputName by path → 25 reads, 37 records (main 66, 85: the signal search)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'InputVar', id: 'iv-name' }],
			pathAttribute: 'inputName',
			byPath: true,
			expected: { storeReads: 25, recordsMoved: { inMemory: 37, local: 37 } },
		},
		'InputVar iv-op.inputName by path → 43 reads, 59 records (main 77, 108: the signal search)': {
			// the signals fixture: SourceRefs and ControlRefs of one LNode sharing names, nameless ones, a name written with (1)
			sourceXml: signalsXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [{ tagName: 'InputVar', id: 'iv-op' }],
			pathAttribute: 'inputName',
			byPath: true,
			expected: { storeReads: 43, recordsMoved: { inMemory: 59, local: 59 } },
		},
		'InputVar iv-trip-paren.inputName by path → 21 reads, 32 records (main 77, 108: the signal search)':
			{
				// the signals fixture: SourceRefs and ControlRefs of one LNode sharing names, nameless ones, a name written with (1)
				sourceXml: signalsXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [{ tagName: 'InputVar', id: 'iv-trip-paren' }],
				pathAttribute: 'inputName',
				byPath: true,
				expected: { storeReads: 21, recordsMoved: { inMemory: 32, local: 32 } },
			},
		'OutputVar ov-trip.outputName by path → 32 reads, 41 records (main 44, 56: the signal search)':
			{
				// the signals fixture: SourceRefs and ControlRefs of one LNode sharing names, nameless ones, a name written with (1)
				sourceXml: signalsXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [{ tagName: 'OutputVar', id: 'ov-trip' }],
				pathAttribute: 'outputName',
				byPath: true,
				expected: { storeReads: 32, recordsMoved: { inMemory: 41, local: 41 } },
			},
		'InputVar iv-f-other.inputName by path → 40 reads, 56 records (main 74, 105: the signal search)':
			{
				// the signals fixture: SourceRefs and ControlRefs of one LNode sharing names, nameless ones, a name written with (1)
				sourceXml: signalsXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [{ tagName: 'InputVar', id: 'iv-f-other' }],
				pathAttribute: 'inputName',
				byPath: true,
				expected: { storeReads: 40, recordsMoved: { inMemory: 56, local: 56 } },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const [record] = await readReferrers({
				query: source.query,
				refs: testCase.refs,
				byPath: testCase.byPath,
			})
			const reads = await countReads({
				perf: source.perf,
				act: () => resolveReferencePath(source.query, record, testCase.pathAttribute),
			})
			const store = typeof window === 'undefined' ? 'inMemory' : 'local'
			expect(reads).toEqual({
				storeReads: testCase.expected.storeReads,
				recordsMoved: testCase.expected.recordsMoved[store],
			})
		},
	})
})

/**
 * Many records in one call: the reads of each merged with the others' (main's reads and records, the records one by
 * one, in each name).
 */
describe('resolveReferencePaths - the store reads of many records', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'9 SourceRef source as imported → 16 reads, 36 records (main 47, 136); local store 42 records (main 149)':
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [
					{ tagName: 'SourceRef', id: 'op-1' },
					{ tagName: 'SourceRef', id: 'op-2' },
					{ tagName: 'SourceRef', id: 'sr-b2' },
					{ tagName: 'SourceRef', id: 'sr-path' },
					{ tagName: 'SourceRef', id: 'sr-spec' },
					{ tagName: 'SourceRef', id: 'sr-stale' },
					{ tagName: 'SourceRef', id: 'sr-twin' },
					{ tagName: 'SourceRef', id: 'sr-uuid' },
				],
				pathAttribute: 'source',
				byPath: false,
				expected: { storeReads: 16, recordsMoved: { inMemory: 36, local: 42 } },
			},
		'9 SourceRef source by path → 15 reads, 35 records (main 54, 162)': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [
				{ tagName: 'SourceRef', id: 'op-1' },
				{ tagName: 'SourceRef', id: 'op-2' },
				{ tagName: 'SourceRef', id: 'sr-b2' },
				{ tagName: 'SourceRef', id: 'sr-path' },
				{ tagName: 'SourceRef', id: 'sr-spec' },
				{ tagName: 'SourceRef', id: 'sr-stale' },
				{ tagName: 'SourceRef', id: 'sr-twin' },
				{ tagName: 'SourceRef', id: 'sr-uuid' },
			],
			pathAttribute: 'source',
			byPath: true,
			expected: { storeReads: 15, recordsMoved: { inMemory: 35, local: 35 } },
		},
		'13 InputVar inputName by path → 31 reads, 61 records (main 837, 1185)': {
			// the signals fixture: SourceRefs and ControlRefs of one LNode sharing names, nameless ones, a name written with (1)
			sourceXml: signalsXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [
				{ tagName: 'InputVar', id: 'iv-dotted' },
				{ tagName: 'InputVar', id: 'iv-f-op-2' },
				{ tagName: 'InputVar', id: 'iv-f-other' },
				{ tagName: 'InputVar', id: 'iv-f-trip-full' },
				{ tagName: 'InputVar', id: 'iv-lnode' },
				{ tagName: 'InputVar', id: 'iv-missing' },
				{ tagName: 'InputVar', id: 'iv-op' },
				{ tagName: 'InputVar', id: 'iv-op-2' },
				{ tagName: 'InputVar', id: 'iv-op-full' },
				{ tagName: 'InputVar', id: 'iv-other-lnode' },
				{ tagName: 'InputVar', id: 'iv-trip' },
				{ tagName: 'InputVar', id: 'iv-trip-full' },
				{ tagName: 'InputVar', id: 'iv-trip-paren' },
			],
			pathAttribute: 'inputName',
			byPath: true,
			expected: { storeReads: 31, recordsMoved: { inMemory: 61, local: 61 } },
		},
		'5 OutputVar outputName by path → 20 reads, 35 records (main 195, 249)': {
			// the signals fixture: SourceRefs and ControlRefs of one LNode sharing names, nameless ones, a name written with (1)
			sourceXml: signalsXml,
			allowIncoherentReferences: NAMING_NOTHING,
			refs: [
				{ tagName: 'OutputVar', id: 'ov-f-trip-1' },
				{ tagName: 'OutputVar', id: 'ov-lnode' },
				{ tagName: 'OutputVar', id: 'ov-op' },
				{ tagName: 'OutputVar', id: 'ov-trip' },
				{ tagName: 'OutputVar', id: 'ov-trip-2' },
			],
			pathAttribute: 'outputName',
			byPath: true,
			expected: { storeReads: 20, recordsMoved: { inMemory: 35, local: 35 } },
		},
		'4 LNodeInputRef and LNodeOutputRef sourceRef by path → 30 reads, 41 records (main 85, 109); local store 42 records (main 113)':
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				refs: [
					{ tagName: 'LNodeInputRef', id: 'in-ref-1' },
					{ tagName: 'LNodeInputRef', id: 'in-ref-2' },
					{ tagName: 'LNodeInputRef', id: 'in-ref-uuid' },
					{ tagName: 'LNodeOutputRef', id: 'out-ref-1' },
				],
				pathAttribute: 'sourceRef',
				byPath: true,
				expected: { storeReads: 30, recordsMoved: { inMemory: 41, local: 42 } },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const records = await readReferrers({
				query: source.query,
				refs: testCase.refs,
				byPath: testCase.byPath,
			})
			const reads = await countReads({
				perf: source.perf,
				act: () =>
					resolveReferencePaths(source.query, { records, pathAttribute: testCase.pathAttribute }),
			})
			const store = typeof window === 'undefined' ? 'inMemory' : 'local'
			expect(reads).toEqual({
				storeReads: testCase.expected.storeReads,
				recordsMoved: testCase.expected.recordsMoved[store],
			})
		},
	})
})
