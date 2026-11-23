import { runBuildIedRefusalCases } from './__tests__/build-ied-cases'
import ldOfAnotherFunctionByPath from './fixtures/build-ied/ld-of-another-function-by-path.xml?raw'
import ldInstEqualsBuiltFunction from './fixtures/build-ied/ldinst-equals-built-function.xml?raw'
import ldInstEqualsFunction from './fixtures/build-ied/ldinst-equals-function.xml?raw'

import { describe } from 'vitest'

import type { BuildIedRefusalCase } from './__tests__/build-ied-cases'
import type { SclTest } from '@/v2019C1/test'

/**
 * One logical device never holds the logical nodes of two elements, whatever the order of the builds: an LNode's own
 * `ldInst` naming another function's logical device is refused, and a logical node bound by its names counts as bound.
 */
describe('buildIed - one logical device, one element', () => {
	const testCases: SclTest.TestCases<BuildIedRefusalCase> = {
		'XCBR1 in CTRL with ldInst PROT and PTOC1 of Function PROT built together → ld-name for XCBR1':
			{
				sourceXml: ldInstEqualsFunction,
				lnodes: ['ptoc1', 'xcbr1'],
				refusals: [{ reason: 'ld-name', ref: 'xcbr1' }],
			},
		'XCBR1 in CTRL with ldInst PROT built alone, Function PROT in the document → ld-name for XCBR1':
			{
				sourceXml: ldInstEqualsFunction,
				lnodes: ['xcbr1'],
				refusals: [{ reason: 'ld-name', ref: 'xcbr1' }],
			},
		'Function PROT already built on S, then XCBR1 in CTRL with ldInst PROT → ld-name for XCBR1': {
			sourceXml: ldInstEqualsBuiltFunction,
			lnodes: ['xcbr1'],
			refusals: [{ reason: 'ld-name', ref: 'xcbr1' }],
		},
		'S holds LD PROT whose PTOC1 is bound by its names from BACKUP, Q01 PROT built → ld-name': {
			sourceXml: ldOfAnotherFunctionByPath,
			lnodes: ['ptoc1'],
			refusals: [{ reason: 'ld-name', ref: 'q01-prot' }],
		},
	}

	runBuildIedRefusalCases({ testCases })
})
