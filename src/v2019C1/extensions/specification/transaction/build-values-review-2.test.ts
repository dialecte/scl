import { runBuildValuesCases } from './__tests__/build-values-cases'
import valuesAttributesCleared from './fixtures/build-values/values-attributes-cleared.xml?raw'
import valuesCountZero from './fixtures/build-values/values-count-zero.xml?raw'

import { describe } from 'vitest'

import type { BuildValuesTestCase } from './__tests__/build-values-cases'
import type { SclTest } from '@/v2019C1/test'

/** The PTOC LN of LD PROT in S. */
const PTOC = '//default:IED[@name="S"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"]'

/** Data that is no array, whatever its count says, and a build that settles. */
describe('buildIed - values on data written count 0, and built again', () => {
	const testCases: SclTest.TestCases<BuildValuesTestCase> = {
		'DA d written count="0", DAS d with Val x → written, count 0 is no array': {
			sourceXml: valuesCountZero,
			lnodes: ['ptoc1'],
			values: [{ das: 'das-d' }],
			valuesLeftOut: [],
			expectedQueries: [
				`${PTOC}/default:DOI[@name="StrVal"]/default:DAI[@name="d"][default:Val="x"]`,
			],
		},
		'the DAI left as specified by a build that cleared valKind and valImport, built again → nothing planned':
			{
				sourceXml: valuesAttributesCleared,
				lnodes: ['ptoc1'],
				values: [],
				valuesLeftOut: [],
				expectedQueries: [
					`${PTOC}/default:DOI[@name="Op"]/default:DAI[@name="general"][default:Val="true"]`,
				],
				unexpectedQueries: [
					`${PTOC}/default:DOI[@name="Op"]/default:DAI[@name="general"]/default:Val[2]`,
				],
			},
	}

	runBuildValuesCases({ testCases })
})
