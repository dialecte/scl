import { ROLE_LNODES, runRebuildCases } from './__tests__/rebuild-cases'
import rebuildValueChanged from './fixtures/rebuild/rebuild-value-changed.xml?raw'

import { describe } from 'vitest'

import type { RebuildTestCase } from './__tests__/rebuild-cases'
import type { SclTest } from '@/v2019C1/test'

/** The values of a rebuild, counted against the DAIs the logical nodes hold. */
describe('buildIed - values of a rebuild', () => {
	const testCases: SclTest.TestCases<RebuildTestCase> = {
		'PTOC1’s DAS f now 2, its DAI 1.5 → one value changed': {
			sourceXml: rebuildValueChanged,
			lnodes: ROLE_LNODES,
			report: { values: { added: 0, changed: 1 } },
			expectedQueries: [
				'//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"]/default:DOI[@name="StrVal"]/default:SDI[@name="setMag"]/default:DAI[@name="f"][default:Val="2"]',
			],
		},
	}

	runRebuildCases({ testCases })
})
