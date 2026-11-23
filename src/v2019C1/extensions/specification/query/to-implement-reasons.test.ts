import ptrc1BoundToSpecificationIedS1 from './fixtures/to-implement/ptrc1-bound-to-specification-ied-s1.xml?raw'
import rLNodesWithoutSpecificationName from './fixtures/to-implement/r-lnodes-without-specification-name.xml?raw'
import { toImplement } from './to-implement'

import { describe, expect, it } from 'vitest'

import { createSclTestProject, runSclTestCases } from '@/v2019C1/test'

import type { ToImplementReason } from './to-implement.types'
import type { SclTest } from '@/v2019C1/test'

/** When a to-do list is empty without being looked for: the reason says why, every list empty. */
describe('toImplement - a reason instead of a list', () => {
	type TestCase = SclTest.BaseXmlTestCase & { ied: string; reason: ToImplementReason }

	const testCases: SclTest.TestCases<TestCase> = {
		'the LNodes R implements carry no sIedName → no-specification-name': {
			// PTOC1 bound to R has no LNodeSpecNaming; PTRC1, unbound, is specified on S1
			sourceXml: rLNodesWithoutSpecificationName,
			ied: 'ied-r',
			reason: 'no-specification-name',
		},
		'the IED given is the specification IED S1 → not-implemented-ied': {
			// S1 has no source file and holds the LN PTRC1 names
			sourceXml: ptrc1BoundToSpecificationIedS1,
			ied: 'ied-s1',
			reason: 'not-implemented-ied',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await toImplement(source.query, { ied: { tagName: 'IED', id: testCase.ied } })
			expect(result).toEqual({
				specifiedAs: [],
				lnodes: [],
				otherImplementers: [],
				reason: testCase.reason,
			})
		},
	})
})

describe('toImplement - an unknown IED', () => {
	it('an IED the document does not hold → ELEMENT_NOT_FOUND', async () => {
		const { source } = await createSclTestProject({ sourceXml: ptrc1BoundToSpecificationIedS1 })

		await expect(
			toImplement(source.document.query, { ied: { tagName: 'IED', id: 'no-such-ied' } }),
		).rejects.toMatchObject({ cause: { key: 'ELEMENT_NOT_FOUND' } })
	})
})
