import functionTemplateLNodeOnS1 from './fixtures/to-implement/function-template-lnode-on-s1.xml?raw'
import ptrc1BoundToSpecificationIedS1 from './fixtures/to-implement/ptrc1-bound-to-specification-ied-s1.xml?raw'
import ptrc1ImplementedByOtherRealIedR2 from './fixtures/to-implement/ptrc1-implemented-by-other-real-ied-r2.xml?raw'
import ptrc1ImplementedNTo1OnR from './fixtures/to-implement/ptrc1-implemented-n-to-1-on-r.xml?raw'
import ptrc1UnboundOnS1 from './fixtures/to-implement/ptrc1-unbound-on-s1.xml?raw'
import rImplementsLNodesOfS1AndS2 from './fixtures/to-implement/r-implements-lnodes-of-s1-and-s2.xml?raw'
import { toImplement } from './to-implement'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/**
 * What is still to implement on the real IED R: the LNodes specified on the specification IED names of what R
 * implements, that no real IED implements yet.
 */
describe('toImplement - the LNodes still to implement on a real IED', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		specifiedAs: string[]
		lnodes: string[]
		otherImplementers: { ied: string; name: string }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'PTOC1 bound to R on S1, PTRC1 unbound on S1, CSWI1 unbound on S2 → specified as S1, PTRC1 to implement':
			{
				// PTOC1 bound to R by lnUuid; PTRC1 and CSWI1 iedName None, specified on S1 and S2
				sourceXml: ptrc1UnboundOnS1,
				specifiedAs: ['S1'],
				lnodes: ['ptrc1'],
				otherImplementers: [],
			},
		'PTRC1 on S1 bound to an LN of the specification IED S1 → still to implement': {
			// S1 has no source file; PTRC1 names its LN by lnUuid
			sourceXml: ptrc1BoundToSpecificationIedS1,
			specifiedAs: ['S1'],
			lnodes: ['ptrc1'],
			otherImplementers: [],
		},
		'PTRC1 on S1 implemented N to 1, its DOS mappedLnUuid naming an LN of R → not listed': {
			// PTRC1 keeps iedName None; its DOS names R's PTOC LN
			sourceXml: ptrc1ImplementedNTo1OnR,
			specifiedAs: ['S1'],
			lnodes: [],
			otherImplementers: [],
		},
		'R implements LNodes specified on S1 and S2 → both names, the unimplemented LNodes of both': {
			// PTOC1 (S1) and CSWI1 (S2) bound to R; PTRC1 (S1) and CILO1 (S2) unbound
			sourceXml: rImplementsLNodesOfS1AndS2,
			specifiedAs: ['S1', 'S2'],
			lnodes: ['ptrc1', 'cilo1'],
			otherImplementers: [],
		},
		'PTRC1 on S1 bound to the real IED R2 → not listed, R2 named as another implementer': {
			// R2 holds an ICD source file and the LN PTRC1 names by lnUuid
			sourceXml: ptrc1ImplementedByOtherRealIedR2,
			specifiedAs: ['S1'],
			lnodes: [],
			otherImplementers: [{ ied: 'ied-r2', name: 'R2' }],
		},
		'an unbound LNode on S1 in a function template → ignored, not in the process section': {
			// a FunctionTemplate in a root Private holds an unbound PTRC1 specified on S1
			sourceXml: functionTemplateLNodeOnS1,
			specifiedAs: ['S1'],
			lnodes: [],
			otherImplementers: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await toImplement(source.query, { ied: { tagName: 'IED', id: 'ied-r' } })
			expect({
				specifiedAs: result.specifiedAs,
				lnodes: result.lnodes.map((lnode) => lnode.id),
				otherImplementers: result.otherImplementers.map(({ ied, name }) => ({ ied: ied.id, name })),
				reason: result.reason,
			}).toEqual({
				specifiedAs: testCase.specifiedAs,
				lnodes: testCase.lnodes,
				otherImplementers: testCase.otherImplementers,
				reason: undefined,
			})
		},
	})
})
