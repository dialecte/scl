import { runBuildValuesCases } from './__tests__/build-values-cases'
import valuesArrayWithoutIx from './fixtures/build-values/values-array-without-ix.xml?raw'
import valuesAttributesDropped from './fixtures/build-values/values-attributes-dropped.xml?raw'
import valuesStructLeaf from './fixtures/build-values/values-struct-leaf.xml?raw'

import { describe } from 'vitest'

import type { BuildValuesTestCase } from './__tests__/build-values-cases'
import type { SclTest } from '@/v2019C1/test'

/** The PTOC LN of LD PROT in S. */
const PTOC = '//default:IED[@name="S"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"]'

/** Values a build must leave as the specification says, or leave out. */
describe('buildIed - values left as specified', () => {
	const testCases: SclTest.TestCases<BuildValuesTestCase> = {
		'DAS general without valKind and valImport, the DAI with both → planned, the DAI keeps neither':
			{
				sourceXml: valuesAttributesDropped,
				lnodes: ['ptoc1'],
				values: [{ das: 'das-op-general', existing: 'built-op-general' }],
				valuesLeftOut: [],
				expectedQueries: [
					`${PTOC}/default:DOI[@name="Op"]/default:DAI[@name="general"][default:Val="true"]`,
				],
				unexpectedQueries: [
					`${PTOC}/default:DOI[@name="Op"]/default:DAI[@name="general"][@valKind]`,
					`${PTOC}/default:DOI[@name="Op"]/default:DAI[@name="general"][@valImport]`,
				],
			},
		'SDS pts without ix on array data, the LN holding element 1 → path-not-in-type, element 1 untouched':
			{
				sourceXml: valuesArrayWithoutIx,
				lnodes: ['ptoc1'],
				values: [],
				valuesLeftOut: [{ das: 'das-pts-f', reason: 'path-not-in-type' }],
				expectedQueries: [
					`${PTOC}/default:DOI[@name="StrVal"]/default:SDI[@name="pts"][@ix="1"]/default:DAI[@name="f"][default:Val="2.5"]`,
				],
				unexpectedQueries: [`${PTOC}//default:Val[.="9"]`],
			},
		'DAS naming the structured setMag → path-not-in-type, nothing written': {
			sourceXml: valuesStructLeaf,
			lnodes: ['ptoc1'],
			values: [],
			valuesLeftOut: [{ das: 'das-setmag', reason: 'path-not-in-type' }],
			unexpectedQueries: [`${PTOC}/default:DOI`],
		},
	}

	runBuildValuesCases({ testCases })
})
