import { answerOf, expectedOf, NAMING_NOTHING, readReferrers } from './__tests__/reference-paths'
import signalsXml from './fixtures/signals-mixed.xml?raw'
import { resolveReferencePaths } from './resolve-reference-path'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { Referrer } from './__tests__/reference-paths.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * The behavior variables of the signals fixture, their uuid companions left out so each signal is searched by its path
 * (short, instance and full forms, names holding a dot or `(1)`, nameless signals, two LNodes): only a signal a key
 * can name has its path built, and each answer is what main's `resolveReferencePath` answered for that record alone.
 */
describe('resolveReferencePaths - signals searched by their path', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		pathAttribute: string
		referrers: readonly Referrer[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"inputName: 13 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the signals fixture: SourceRefs and ControlRefs of one LNode sharing names, nameless ones, a name written with (1)
				sourceXml: signalsXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'inputName',
				referrers: [
					{
						ref: { tagName: 'InputVar', id: 'iv-dotted' },
						answer: { tagName: 'SourceRef', id: 'sr-dotted' },
					},
					{
						ref: { tagName: 'InputVar', id: 'iv-f-op-2' },
						answer: { tagName: 'SourceRef', id: 'sr-op-2' },
					},
					{
						ref: { tagName: 'InputVar', id: 'iv-f-other' },
						answer: { tagName: 'SourceRef', id: 'sr-op-other' },
					},
					{
						ref: { tagName: 'InputVar', id: 'iv-f-trip-full' },
						answer: { tagName: 'SourceRef', id: 'sr-trip' },
					},
					{ ref: { tagName: 'InputVar', id: 'iv-lnode' }, answer: undefined },
					{ ref: { tagName: 'InputVar', id: 'iv-missing' }, answer: undefined },
					{ ref: { tagName: 'InputVar', id: 'iv-op' }, answer: undefined },
					{
						ref: { tagName: 'InputVar', id: 'iv-op-2' },
						answer: { tagName: 'SourceRef', id: 'sr-op-2' },
					},
					{
						ref: { tagName: 'InputVar', id: 'iv-op-full' },
						answer: { tagName: 'SourceRef', id: 'sr-op-1' },
					},
					{ ref: { tagName: 'InputVar', id: 'iv-other-lnode' }, answer: undefined },
					{
						ref: { tagName: 'InputVar', id: 'iv-trip' },
						answer: { tagName: 'SourceRef', id: 'sr-trip' },
					},
					{
						ref: { tagName: 'InputVar', id: 'iv-trip-full' },
						answer: { tagName: 'SourceRef', id: 'sr-trip' },
					},
					{
						ref: { tagName: 'InputVar', id: 'iv-trip-paren' },
						answer: { tagName: 'SourceRef', id: 'sr-trip-paren' },
					},
				],
			},
		"outputName: 5 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the signals fixture: SourceRefs and ControlRefs of one LNode sharing names, nameless ones, a name written with (1)
				sourceXml: signalsXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'outputName',
				referrers: [
					{
						ref: { tagName: 'OutputVar', id: 'ov-f-trip-1' },
						answer: { tagName: 'ControlRef', id: 'cr-trip-1' },
					},
					{ ref: { tagName: 'OutputVar', id: 'ov-lnode' }, answer: undefined },
					{
						ref: { tagName: 'OutputVar', id: 'ov-op' },
						answer: { tagName: 'ControlRef', id: 'cr-op' },
					},
					{ ref: { tagName: 'OutputVar', id: 'ov-trip' }, answer: undefined },
					{
						ref: { tagName: 'OutputVar', id: 'ov-trip-2' },
						answer: { tagName: 'ControlRef', id: 'cr-trip-2' },
					},
				],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const refs = testCase.referrers.map((referrer) => referrer.ref)
			const records = await readReferrers({ query: source.query, refs, byPath: true })
			const substation = await source.query.getRecord({ tagName: 'Substation', id: 'sub-1' })
			const given = [...records, records[0], substation as Scl.TrackedRecord<Scl.ElementsOf>]
			const results = await resolveReferencePaths(source.query, {
				records: given,
				pathAttribute: testCase.pathAttribute,
			})
			const expected = expectedOf({ referrers: testCase.referrers })
			expect(results.map(answerOf)).toEqual([...expected, expected[0], undefined])
		},
	})
})
