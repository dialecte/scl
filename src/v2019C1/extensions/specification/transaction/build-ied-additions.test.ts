import { runBuildIedRefusalCases } from './__tests__/build-ied-cases'
import lnNames from './fixtures/build-ied/ln-names.xml?raw'

import { describe } from 'vitest'

import type { BuildIedRefusalCase } from './__tests__/build-ied-cases'
import type { SclTest } from '@/v2019C1/test'

/** A logical device whose LLN0 LNode is refused gets no LN0 added in its place. */
describe('buildIed - no LN0 added in place of a refused LLN0 LNode', () => {
	const testCases: SclTest.TestCases<BuildIedRefusalCase> = {
		'LLN0 LNode with prefix X, no rule → ln-name, and only the LPHD type missing': {
			sourceXml: lnNames,
			lnodes: ['lln0-prefixed'],
			openValues: null,
			refusals: [
				{ reason: 'ln-name', ref: 'lln0-prefixed' },
				{ reason: 'type-missing', ref: 'q01-prot' },
			],
		},
	}

	runBuildIedRefusalCases({ testCases })
})
