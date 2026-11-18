import { answerOf, expectedOf, NAMING_NOTHING, readReferrers } from './__tests__/reference-paths'
import mixedXml from './fixtures/reference-paths-mixed.xml?raw'
import { resolveReferencePaths } from './resolve-reference-path'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { Referrer } from './__tests__/reference-paths.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * The referrers of the mixed fixture holding a path, their uuid companions left out so the path is searched (ancestries,
 * names in their scope, function bases, ied addresses), one call per path attribute, the first given again and a
 * Substation after them: each answer what main's `resolveReferencePath` answered for that record alone.
 */
describe('resolveReferencePaths - every path kind searched by its path, one call per path attribute', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		pathAttribute: string
		referrers: readonly Referrer[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"controlled: 2 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'controlled',
				referrers: [
					{
						ref: { tagName: 'ControlRef', id: 'cr-oper' },
						answer: { tagName: 'LNode', id: 'ln-xcbr' },
					},
					{
						ref: { tagName: 'ControlRef', id: 'cr-oper-2' },
						answer: { tagName: 'LNode', id: 'ln-xcbr' },
					},
				],
			},
		"extCtrlAddr: 2 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'extCtrlAddr',
				referrers: [
					{
						ref: { tagName: 'ControlRef', id: 'cr-oper' },
						answer: { tagName: 'ExtCtrl', id: 'ext-ctrl-close' },
					},
					{
						ref: { tagName: 'ControlRef', id: 'cr-oper-2' },
						answer: { tagName: 'ExtCtrl', id: 'ext-ctrl-open' },
					},
				],
			},
		"function: 5 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'function',
				referrers: [
					{ ref: { tagName: 'FunctionCatRef', id: 'fcatref-none' }, answer: undefined },
					{
						ref: { tagName: 'FunctionCatRef', id: 'fcatref-path' },
						answer: { tagName: 'Function', id: 'f1-b2' },
					},
					{
						ref: { tagName: 'FunctionCatRef', id: 'fcatref-sub' },
						answer: { tagName: 'SubFunction', id: 'sf1' },
					},
					{
						ref: { tagName: 'FunctionRef', id: 'fref-1' },
						answer: { tagName: 'Function', id: 'f1' },
					},
					{
						ref: { tagName: 'FunctionRef', id: 'fref-2' },
						answer: { tagName: 'SubFunction', id: 'sf1' },
					},
				],
			},
		"functionalVariant: 3 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'functionalVariant',
				referrers: [
					{
						ref: { tagName: 'FunctionalVariantRef', id: 'fvref-1' },
						answer: { tagName: 'FunctionalVariant', id: 'fv-1-fast' },
					},
					{
						ref: { tagName: 'FunctionalVariantRef', id: 'fvref-2' },
						answer: { tagName: 'FunctionalVariant', id: 'fv-2-fast' },
					},
					{ ref: { tagName: 'FunctionalVariantRef', id: 'fvref-none' }, answer: undefined },
				],
			},
		"dataName: 2 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'dataName',
				referrers: [
					{
						ref: { tagName: 'InputVar', id: 'iv-name' },
						answer: { tagName: 'LNode', id: 'ln-ptrc', qualifier: 'Op.general' },
					},
					{
						ref: { tagName: 'InputVar', id: 'iv-uuid' },
						answer: { tagName: 'LNode', id: 'ln-ptrc', qualifier: 'Op' },
					},
				],
			},
		"inputName: 2 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'inputName',
				referrers: [
					{
						ref: { tagName: 'InputVar', id: 'iv-name' },
						answer: { tagName: 'SourceRef', id: 'sr-path' },
					},
					{
						ref: { tagName: 'InputVar', id: 'iv-uuid' },
						answer: { tagName: 'SourceRef', id: 'sr-uuid' },
					},
				],
			},
		"data: 1 referrer, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'data',
				referrers: [
					{
						ref: { tagName: 'LNodeDataRef', id: 'data-ref-1' },
						answer: { tagName: 'LNode', id: 'ln-pdis', qualifier: 'Str.general' },
					},
				],
			},
		"sourceRef: 3 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'sourceRef',
				referrers: [
					{
						ref: { tagName: 'LNodeInputRef', id: 'in-ref-1' },
						answer: { tagName: 'SourceRef', id: 'op-2' },
					},
					{
						ref: { tagName: 'LNodeInputRef', id: 'in-ref-2' },
						answer: { tagName: 'SourceRef', id: 'op-1' },
					},
					{
						ref: { tagName: 'LNodeInputRef', id: 'in-ref-uuid' },
						answer: { tagName: 'SourceRef', id: 'op-1' },
					},
				],
			},
		"controlRef: 1 referrer, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'controlRef',
				referrers: [
					{
						ref: { tagName: 'LNodeOutputRef', id: 'out-ref-1' },
						answer: { tagName: 'ControlRef', id: 'pdis-trip' },
					},
				],
			},
		"outputName: 1 referrer, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'outputName',
				referrers: [
					{
						ref: { tagName: 'OutputVar', id: 'ov-plain' },
						answer: { tagName: 'ControlRef', id: 'cr-oper' },
					},
				],
			},
		"source: 6 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'source',
				referrers: [
					{
						ref: { tagName: 'SourceRef', id: 'sr-b2' },
						answer: { tagName: 'LNode', id: 'ln-xcbr-b2', qualifier: 'Pos' },
					},
					{
						ref: { tagName: 'SourceRef', id: 'sr-path' },
						answer: { tagName: 'LNode', id: 'ln-xcbr', qualifier: 'Pos' },
					},
					{
						ref: { tagName: 'SourceRef', id: 'sr-spec' },
						answer: { tagName: 'LNode', id: 'ln-cswi' },
					},
					{ ref: { tagName: 'SourceRef', id: 'sr-stale' }, answer: undefined },
					{
						ref: { tagName: 'SourceRef', id: 'sr-twin' },
						answer: { tagName: 'LNode', id: 'ln-ggio-a', qualifier: 'Ind' },
					},
					{
						ref: { tagName: 'SourceRef', id: 'sr-uuid' },
						answer: { tagName: 'LNode', id: 'ln-xcbr', qualifier: 'Pos.stVal' },
					},
				],
			},
		"resourceName: 2 referrers, the first again, a Substation → main's answers, the first again, undefined":
			{
				// the mixed fixture: every path kind, a stale uuid, twin and same-name targets in two Bays
				sourceXml: mixedXml,
				allowIncoherentReferences: NAMING_NOTHING,
				pathAttribute: 'resourceName',
				referrers: [
					{ ref: { tagName: 'SourceRef', id: 'sr-path' }, answer: undefined },
					{
						ref: { tagName: 'SourceRef', id: 'sr-uuid' },
						answer: { tagName: 'ProcessResource', id: 'pr1' },
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
