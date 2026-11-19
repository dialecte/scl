import { findRefsPointingTo } from './find-refs-pointing-to'
import refsWithContainersXml from './fixtures/refs-with-containers.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test/hydrated-test'

import type { ResolvedReference } from './find-refs-pointing-to.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type Resolved = { ref: string; container: string | undefined }

function resolvedOf(results: readonly ResolvedReference[]): Resolved[] {
	return results.map(function toResolved({ ref, container }) {
		return { ref: ref.id, container: container?.id }
	})
}

// The fixture: XCBR1 of I1 named by an LNode in the Bay, one in F1 (with a DOS naming it and a DOS + DAS following it
// by default) and one in SF1 of F2; XCBR_T typing three LNs in two IEDs and the three LNodes.
describe('findRefsPointingTo - containers, in order', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		target: { tagName: string; id: string }
		containerTagName: Scl.ElementsOf
		expected: Resolved[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'LNodeType XCBR_T, container IED → the LNs with their IED, the LNodes with none': {
			// XCBR_T types XCBR1 and XCBR2 of I1, XCBR1 of I2 and the three LNodes of the Bay, F1 and SF1
			sourceXml: refsWithContainersXml,
			target: { tagName: 'LNodeType', id: 'lnt-xcbr' },
			containerTagName: 'IED',
			expected: [
				{ ref: 'i2-xcbr-1', container: 'ied-2' },
				{ ref: 'xcbr-1', container: 'ied-1' },
				{ ref: 'xcbr-2', container: 'ied-1' },
				{ ref: 'lnode-bay', container: undefined },
				{ ref: 'lnode-f1', container: undefined },
				{ ref: 'lnode-sf', container: undefined },
			],
		},
		'LNodeType XCBR_T, container Function → the LNodes in a Function (through a SubFunction) with it':
			{
				// XCBR_T types XCBR1 and XCBR2 of I1, XCBR1 of I2 and the three LNodes of the Bay, F1 and SF1
				sourceXml: refsWithContainersXml,
				target: { tagName: 'LNodeType', id: 'lnt-xcbr' },
				containerTagName: 'Function',
				expected: [
					{ ref: 'i2-xcbr-1', container: undefined },
					{ ref: 'xcbr-1', container: undefined },
					{ ref: 'xcbr-2', container: undefined },
					{ ref: 'lnode-bay', container: undefined },
					{ ref: 'lnode-f1', container: 'fn-1' },
					{ ref: 'lnode-sf', container: 'fn-2' },
				],
			},
		'LN XCBR1, container Function → the LNodes, the DOS naming it and the data following it, each with its Function':
			{
				// XCBR1 of I1: named by the three LNodes and the DOS Beh, followed by the DOS Pos and its DAS in F1
				sourceXml: refsWithContainersXml,
				target: { tagName: 'LN', id: 'xcbr-1' },
				containerTagName: 'Function',
				expected: [
					{ ref: 'lnode-bay', container: undefined },
					{ ref: 'lnode-f1', container: 'fn-1' },
					{ ref: 'lnode-sf', container: 'fn-2' },
					{ ref: 'das-stval', container: 'fn-1' },
					{ ref: 'dos-beh', container: 'fn-1' },
					{ ref: 'dos-pos', container: 'fn-1' },
				],
			},
		'LN XCBR1, container Bay → every referrer with the one Bay': {
			// XCBR1 of I1: named by the three LNodes and the DOS Beh, followed by the DOS Pos and its DAS in F1
			sourceXml: refsWithContainersXml,
			target: { tagName: 'LN', id: 'xcbr-1' },
			containerTagName: 'Bay',
			expected: [
				{ ref: 'lnode-bay', container: 'bay-1' },
				{ ref: 'lnode-f1', container: 'bay-1' },
				{ ref: 'lnode-sf', container: 'bay-1' },
				{ ref: 'das-stval', container: 'bay-1' },
				{ ref: 'dos-beh', container: 'bay-1' },
				{ ref: 'dos-pos', container: 'bay-1' },
			],
		},
		'LN XCBR2, named by nothing → no referrer': {
			// XCBR2 of I1: no LNode, no data names it
			sourceXml: refsWithContainersXml,
			target: { tagName: 'LN', id: 'xcbr-2' },
			containerTagName: 'Function',
			expected: [],
		},
		'a target naming no element → no referrer': {
			// no LN carries that id
			sourceXml: refsWithContainersXml,
			target: { tagName: 'LN', id: 'missing' },
			containerTagName: 'Function',
			expected: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const results = await findRefsPointingTo(source.query, {
				target: testCase.target as Scl.Ref<Scl.ElementsOf>,
				containerTagName: testCase.containerTagName,
			})
			expect(resolvedOf(results)).toEqual(testCase.expected)
		},
	})
})

// Inside a transaction: the Bay LNode deleted, the SF1 LNode now naming XCBR2, an LNode naming XCBR1 created in F2.
describe('findRefsPointingTo - containers inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		containerTagName: Scl.ElementsOf
		expected: (created: string) => Resolved[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'LN XCBR1, container Function → the staged referrers with their Function': {
			// the writes of the transaction above, then XCBR1 of I1 asked
			sourceXml: refsWithContainersXml,
			containerTagName: 'Function',
			expected: (created) => [
				{ ref: 'lnode-f1', container: 'fn-1' },
				{ ref: created, container: 'fn-2' },
				{ ref: 'das-stval', container: 'fn-1' },
				{ ref: 'dos-beh', container: 'fn-1' },
				{ ref: 'dos-pos', container: 'fn-1' },
			],
		},
		'LN XCBR1, container SubFunction → none of them in a SubFunction any more': {
			// the writes of the transaction above, then XCBR1 of I1 asked
			sourceXml: refsWithContainersXml,
			containerTagName: 'SubFunction',
			expected: (created) => [
				{ ref: 'lnode-f1', container: undefined },
				{ ref: created, container: undefined },
				{ ref: 'das-stval', container: undefined },
				{ ref: 'dos-beh', container: undefined },
				{ ref: 'dos-pos', container: undefined },
			],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const answered: { got: Resolved[]; expected: Resolved[] } = { got: [], expected: [] }
			await source.transaction(async function findStaged(tx) {
				await tx.delete({ tagName: 'LNode', id: 'lnode-bay' })
				await tx.update(
					{ tagName: 'LNode', id: 'lnode-sf' },
					{ attributes: { lnInst: '2', lnUuid: 'xcbr2-uuid' } },
				)
				const created = await tx.addChild(
					{ tagName: 'Function', id: 'fn-2' },
					{
						tagName: 'LNode',
						attributes: {
							iedName: 'I1',
							ldInst: 'LD0',
							lnClass: 'XCBR',
							lnInst: '1',
							lnType: 'XCBR_T',
							lnUuid: 'xcbr1-uuid',
						},
					},
				)
				const results = await findRefsPointingTo(tx, {
					target: { tagName: 'LN', id: 'xcbr-1' },
					containerTagName: testCase.containerTagName,
				})
				answered.got = resolvedOf(results)
				answered.expected = testCase.expected(created.id)
			})
			expect(answered.got).toEqual(answered.expected)
		},
	})
})
