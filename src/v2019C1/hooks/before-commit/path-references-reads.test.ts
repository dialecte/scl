import bayWithATerminal from './fixtures/bay-with-a-terminal.xml?raw'
import functionsAndACategory from './fixtures/functions-and-a-category.xml?raw'
import { writePathReferencesAtCommit } from './path-references'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { PATH_PAIRS_BY_TAG } from '@/v2019C1/hooks/shared/path-references.constants'
import { updatedOperation, withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'
import { runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type { AnyRawRecord } from '@dialecte/core'

const PATH_REFERRER_TAGS = [...PATH_PAIRS_BY_TAG.keys()].sort()

describe('the reads of the commit resolving path references', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		edited: Scl.Ref<Scl.ElementsOf>
		attributes: Record<string, string>
		/** The tags read by tag (sorted) and the times the whole document is read. */
		expected: { tags: string[]; documentReads: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// functions-and-a-category.xml: F2 renamed; ref1 names F1 by uuid, no reference waits
		'a function renamed, every path reference holding its uuid → the path referrer tags read once, no document read':
			{
				sourceXml: functionsAndACategory,
				edited: { tagName: 'Function', id: 'f2' },
				attributes: { name: 'F3' },
				expected: { tags: PATH_REFERRER_TAGS, documentReads: 0 },
			},
		// ref1, given a path with no uuid for it to keep: the commit resolves it, reading the document once
		'a path reference left with a path and no uuid → the document read once': {
			sourceXml: functionsAndACategory,
			edited: { tagName: 'FunctionCatRef', id: 'ref1' },
			attributes: { function: 'S1/VL1/B1/F2', functionUuid: '' },
			expected: { tags: [], documentReads: 1 },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const record = await source.query.getRecord(testCase.edited)
		if (!record) throw new Error('edited record missing')
		const raw = toRawRecord(record)
		const values = Object.entries(testCase.attributes).map(([name, value]) => ({
			name,
			value: value === '' ? undefined : value,
		}))
		const operation = updatedOperation(raw, withAttributeValues(raw.attributes, values))
		const anyReads = countQueryReads(source.query.any)
		const tagReads = countQueryReads(source.query)
		const query = new Proxy(tagReads.query, {
			get(target, property) {
				return property === 'any' ? anyReads.query : Reflect.get(target, property, target)
			},
		})
		await writePathReferencesAtCommit({ operations: [operation], query, pending: new Map() })
		expect({
			tags: tagReads.calls
				.filter((call) => call.method === 'getRecordsByTagName')
				.map((call) => String(call.args[0]))
				.sort(),
			documentReads: anyReads.calls.filter((call) => call.method === 'getTree').length,
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('the reads of a commit creating an element a path may name', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		created: {
			parent: Scl.Ref<Scl.ElementsOf>
			tagName: string
			attributes: Record<string, string>
		}
		expected: { tags: string[]; documentReads: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// the bay gets a function F3; no path reference waits for it
		'a function created → the path referrer tags read once each, no document read': {
			sourceXml: functionsAndACategory,
			created: {
				parent: { tagName: 'Bay', id: 'b1' },
				tagName: 'Function',
				attributes: { name: 'F3', uuid: 'f3' },
			},
			expected: { tags: PATH_REFERRER_TAGS, documentReads: 0 },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const { parent, tagName, attributes } = testCase.created
		const operation: Scl.Operation = {
			status: 'created',
			oldRecord: undefined,
			newRecord: {
				id: 'created-f3',
				tagName,
				namespace: { prefix: '', uri: '' },
				attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
				value: '',
				parent,
				children: [],
			} as unknown as Scl.RawRecord<Scl.ElementsOf>,
		}
		const anyReads = countQueryReads(source.query.any)
		const tagReads = countQueryReads(source.query)
		const query = new Proxy(tagReads.query, {
			get(target, property) {
				return property === 'any' ? anyReads.query : Reflect.get(target, property, target)
			},
		})
		await writePathReferencesAtCommit({ operations: [operation], query, pending: new Map() })
		expect({
			tags: tagReads.calls
				.filter((call) => call.method === 'getRecordsByTagName')
				.map((call) => String(call.args[0]))
				.sort(),
			documentReads: anyReads.calls.filter((call) => call.method === 'getTree').length,
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('the reads of a commit renaming an element while a path reference waits', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		renamed: Scl.Ref<Scl.ElementsOf>
		name: string
		/** The path ref1 waits with, no uuid beside it. */
		waitingPath: string
		/** The times the whole document is read, and the functionUuid written on ref1 (none when nothing). */
		expected: { documentReads: number; functionUuid: string | undefined }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// functions-and-a-category.xml: ref1 waits for an F9 the bay lacks; F2 renamed F3 is no segment of its path
		'a reference waiting for a path naming nothing, an unrelated function renamed → no document read':
			{
				sourceXml: functionsAndACategory,
				renamed: { tagName: 'Function', id: 'f2' },
				name: 'F3',
				waitingPath: 'S1/VL1/B1/F9',
				expected: { documentReads: 0, functionUuid: undefined },
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const renamed = await source.query.getRecord(testCase.renamed)
		const reference = await source.query.getRecord({ tagName: 'FunctionCatRef', id: 'ref1' })
		if (!renamed || !reference) throw new Error('fixture record missing')
		const rawRenamed = toRawRecord(renamed)
		const operation = updatedOperation(
			rawRenamed,
			withAttributeValues(rawRenamed.attributes, [{ name: 'name', value: testCase.name }]),
		)
		const rawReference = toRawRecord(reference)
		// ref1 as an earlier step of the commit wrote it: the waiting path, no uuid
		const waiting = {
			...rawReference,
			attributes: [
				...rawReference.attributes.filter(
					(attribute) => attribute.name !== 'function' && attribute.name !== 'functionUuid',
				),
				{ name: 'function', value: testCase.waitingPath },
			],
		} as AnyRawRecord
		const anyReads = countQueryReads(source.query.any)
		const query = new Proxy(source.query, {
			get(target, property) {
				return property === 'any' ? anyReads.query : Reflect.get(target, property, target)
			},
		})
		const written = await writePathReferencesAtCommit({
			operations: [operation],
			query,
			pending: new Map([[waiting.id, waiting]]),
		})
		const functionUuid = written
			.flatMap((written) => (written.status === 'deleted' ? [] : written.newRecord.attributes))
			.find((attribute) => attribute.name === 'functionUuid')?.value
		expect({
			documentReads: anyReads.calls.filter((call) => call.method === 'getTree').length,
			functionUuid,
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('the reads of a commit writing a terminal that names the grounded node', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The bay's new name; the terminal of QE1 is written below it, still naming the grounded node. */
		bayName: string
		expected: { documentReads: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// bay-with-a-terminal.xml: t2 names S1/VL1/B1/grounded, which no file holds; the bay renamed B2 rewrites it
		'a bay renamed, its grounded terminal written below the new name → no document read': {
			sourceXml: bayWithATerminal,
			bayName: 'B2',
			expected: { documentReads: 0 },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const bay = await source.query.getRecord({ tagName: 'Bay', id: 'b1' })
		const terminal = await source.query.getRecord({ tagName: 'Terminal', id: 't2' })
		if (!bay || !terminal) throw new Error('fixture record missing')
		const rawBay = toRawRecord(bay) as Scl.RawRecord<Scl.ElementsOf>
		const rawTerminal = toRawRecord(terminal) as Scl.RawRecord<Scl.ElementsOf>
		// the bay renamed, and its grounded terminal written below the new name as the update hooks write it
		const edits: [Scl.RawRecord<Scl.ElementsOf>, Record<string, string>][] = [
			[rawBay, { name: testCase.bayName }],
			[
				rawTerminal,
				{
					connectivityNode: `S1/VL1/${testCase.bayName}/grounded`,
					bayName: testCase.bayName,
				},
			],
		]
		const operations = edits.map(([record, values]): Scl.Operation => ({
			status: 'updated',
			oldRecord: record,
			newRecord: {
				...record,
				attributes: [
					...record.attributes.filter((attribute) => !(attribute.name in values)),
					...Object.entries(values).map(([name, value]) => ({ name, value })),
				],
			} as Scl.RawRecord<Scl.ElementsOf>,
		}))
		const anyReads = countQueryReads(source.query.any)
		const query = new Proxy(source.query, {
			get(target, property) {
				return property === 'any' ? anyReads.query : Reflect.get(target, property, target)
			},
		})
		await writePathReferencesAtCommit({
			operations,
			query,
			pending: new Map(),
		})
		expect({
			documentReads: anyReads.calls.filter((call) => call.method === 'getTree').length,
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
