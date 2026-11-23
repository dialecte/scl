import { runBuildIedRefusalCases } from './__tests__/build-ied-cases'
import ldInstSharedByTwoFunctions from './fixtures/build-ied/ldinst-shared-by-two-functions.xml?raw'

import { describe } from 'vitest'

import type { BuildIedRefusalCase } from './__tests__/build-ied-cases'
import type { SclTest } from '@/v2019C1/test'

/** LNodes of two elements naming one `ldInst` never share a logical device: built together, both are refused. */
describe('buildIed - one explicit ldInst, two elements', () => {
	const testCases: SclTest.TestCases<BuildIedRefusalCase> = {
		'XCBR1 in CTRL and MMXU1 in MEAS, both with ldInst CB, built together → ld-name for both': {
			sourceXml: ldInstSharedByTwoFunctions,
			lnodes: ['xcbr1', 'mmxu1'],
			refusals: [
				{ reason: 'ld-name', ref: 'xcbr1' },
				{ reason: 'ld-name', ref: 'mmxu1' },
			],
		},
	}

	runBuildIedRefusalCases({ testCases })
})
