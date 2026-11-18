import { answerOf, NAMING_NOTHING, readReferrers } from './__tests__/reference-paths'
import mixedXml from './fixtures/reference-paths-mixed.xml?raw'
import { resolveReferencePaths } from './resolve-reference-path'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { Answer } from './__tests__/reference-paths.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * The resolves of one call end at different steps (paths checked against the ancestries of one or several candidates,
 * a path naming nothing, a record without a value, a record whose tag has no such pair, twins), their uuid companions
 * left out: every record answers, in input order.
 */
describe('resolveReferencePaths - records ending at different steps', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		pathAttribute: string
		expected: Answer[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'ancestry checks of one and two candidates, a path naming nothing, no value, no pair, twins → each its answer':
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'source',
				refs: [
					{ tagName: 'SourceRef', id: 'sr-b2' },
					{ tagName: 'SourceRef', id: 'sr-uuid' },
					{ tagName: 'SourceRef', id: 'sr-stale' },
					{ tagName: 'SourceRef', id: 'op-1' },
					{ tagName: 'ControlRef', id: 'cr-oper' },
					{ tagName: 'SourceRef', id: 'sr-twin' },
				],
				expected: [
					{ tagName: 'LNode', id: 'ln-xcbr-b2', qualifier: 'Pos' },
					{ tagName: 'LNode', id: 'ln-xcbr', qualifier: 'Pos.stVal' },
					undefined,
					undefined,
					undefined,
					{ tagName: 'LNode', id: 'ln-ggio-a', qualifier: 'Ind' },
				],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const records = await readReferrers({
				query: source.query,
				refs: testCase.refs,
				byPath: true,
			})
			const results = await resolveReferencePaths(source.query, {
				records,
				pathAttribute: testCase.pathAttribute,
			})
			expect(results.map(answerOf)).toEqual(testCase.expected)
		},
	})
})

/**
 * Records whose reads are refused (their parent link names an element of another tag) do not hold the others: every
 * record runs to its end, then the call throws the error of the first refused record in input order, even when a later
 * one is refused first (a record whose uuid names nothing reaches its parent link one read later).
 */
describe('resolveReferencePaths - records whose reads are refused', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		pathAttribute: string
		/** The referrers given, in order, each with its parent link and the attributes added to it. */
		given: {
			ref: Scl.Ref<Scl.ElementsOf>
			parent: Scl.Ref<Scl.ElementsOf>
			added: { name: string; value: string }[]
		}[]
		expectedError: string
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"refused at its second read, then a good one, then one refused at its first read → the first one's mismatch":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'sourceRef',
				given: [
					{
						ref: { tagName: 'LNodeInputRef', id: 'in-ref-1' },
						parent: { tagName: 'Substation', id: 'role-signals-1' },
						added: [{ name: 'sourceRefUuid', value: 'no-such-uuid' }],
					},
					{
						ref: { tagName: 'LNodeInputRef', id: 'in-ref-uuid' },
						parent: { tagName: 'SignalRole', id: 'role-signals-1' },
						added: [],
					},
					{
						ref: { tagName: 'LNodeInputRef', id: 'in-ref-2' },
						parent: { tagName: 'Bay', id: 'role-signals-2' },
						added: [],
					},
				],
				expectedError: "Expected tagName 'Substation', got 'SignalRole'",
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const refs = testCase.given.map((entry) => entry.ref)
			const records = await readReferrers({ query: source.query, refs, byPath: true })
			const given = records.map((record, index) => ({
				...record,
				parent: testCase.given[index].parent,
				attributes: [...record.attributes, ...testCase.given[index].added],
			})) as Scl.TrackedRecord<Scl.ElementsOf>[]
			const call = resolveReferencePaths(source.query, {
				records: given,
				pathAttribute: testCase.pathAttribute,
			})
			await expect(call).rejects.toThrow(testCase.expectedError)
		},
	})
})

/**
 * A record given twice answers two records of its own, as two resolves did: a change to the first answer's
 * attributes or children leaves the second as read.
 */
describe('resolveReferencePaths - a record given twice', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		pathAttribute: string
		expectedTargetId: string
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a SourceRef twice, the first answer changed → the second answer unchanged': {
			// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
			sourceXml: mixedXml,
			allowIncoherentReferences: NAMING_NOTHING,
			ref: { tagName: 'SourceRef', id: 'sr-uuid' },
			pathAttribute: 'source',
			expectedTargetId: 'ln-xcbr',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const [record] = await readReferrers({
				query: source.query,
				refs: [testCase.ref],
				byPath: false,
			})
			const [first, second] = await resolveReferencePaths(source.query, {
				records: [record, record],
				pathAttribute: testCase.pathAttribute,
			})
			const secondAsRead = structuredClone(second?.record)
			first?.record.attributes.push({ name: 'desc', value: 'changed' } as never)
			first?.record.children.push({ tagName: 'Private', id: 'added' } as never)
			expect({ firstTarget: first?.record.id, second: second?.record }).toEqual({
				firstTarget: testCase.expectedTargetId,
				second: secondAsRead,
			})
		},
	})
})
