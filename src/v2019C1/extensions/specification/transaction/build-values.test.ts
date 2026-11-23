import { runBuildValuesCases } from './__tests__/build-values-cases'
import valuesBuilt from './fixtures/build-values/values-built.xml?raw'
import values from './fixtures/build-values/values.xml?raw'

import { describe } from 'vitest'

import type { BuildValuesTestCase } from './__tests__/build-values-cases'
import type { SclTest } from '@/v2019C1/test'

/** The PTOC LN of LD PROT in S. */
const PTOC = '//default:IED[@name="S"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"]'
/** The LN0 of LD PROT in S. */
const LN0 = '//default:IED[@name="S"]//default:LDevice[@inst="PROT"]/default:LN0'

/** Every value the specification holds, on the built logical nodes, in the order the dialecte declares (SDS before DAS). */
const ALL_VALUES = [
	{ das: 'das-beh-stval' },
	{ das: 'das-setmag-f' },
	{ das: 'das-pts1-f' },
	{ das: 'das-d' },
	{ das: 'das-op-general' },
]

/** The specified values (DOS, SDS, DAS with a Val) written as DOI, SDI and DAI of the built logical nodes. */
describe('buildIed - the specified values', () => {
	const testCases: SclTest.TestCases<BuildValuesTestCase> = {
		'LLN0, PTOC1 and PTRC1 of PROT → every Val on its DAI, the DO the type lacks left out': {
			sourceXml: values,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			values: ALL_VALUES,
			valuesLeftOut: [{ das: 'das-mod-stval', reason: 'path-not-in-type' }],
			expectedQueries: [
				`${PTOC}/default:DOI[@name="StrVal"]/default:SDI[@name="setMag"]/default:DAI[@name="f"][default:Val="1.5"]`,
				`${PTOC}/default:DOI[@name="StrVal"]/default:DAI[@name="d"][default:Val="Overcurrent"]`,
				`${PTOC}/default:DOI[@name="StrVal"]/default:SDI[@name="pts"][@ix="1"]/default:DAI[@name="f"][default:Val="2.5"]`,
				`${PTOC}/default:DOI[@name="Op"]/default:DAI[@name="general"][@valKind="RO"][@valImport="true"][default:Val[@sGroup="1"]="true"][default:Val[@sGroup="2"]="false"]`,
				`${LN0}/default:DOI[@name="Beh"]/default:DAI[@name="stVal"][default:Val="1"]`,
			],
			unexpectedQueries: [
				`${PTOC}/default:DOI[@name="Str"]`,
				`${PTOC}/default:DOI[@name="Mod"]`,
				'//default:IED//default:DOI[@name="Tr"]',
				'//default:IED//*[@mappedDoName or @mappedDaName or @mappedLnUuid]',
			],
		},
		'excludeFunctionalConstraints DC → the DC value left out, the others written': {
			sourceXml: values,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			excludeFunctionalConstraints: ['DC'],
			values: ALL_VALUES.filter((value) => value.das !== 'das-d'),
			valuesLeftOut: [
				{ das: 'das-d', reason: 'functional-constraint' },
				{ das: 'das-mod-stval', reason: 'path-not-in-type' },
			],
			expectedQueries: [`${PTOC}/default:DOI[@name="StrVal"]/default:SDI[@name="setMag"]`],
			unexpectedQueries: [`${PTOC}/default:DOI[@name="StrVal"]/default:DAI[@name="d"]`],
		},
		'excludeFunctionalConstraints SP → the f below setMag and pts left out, their constraint read from the DA':
			{
				sourceXml: values,
				lnodes: ['lln0', 'ptoc1', 'ptrc1'],
				excludeFunctionalConstraints: ['SP'],
				values: ALL_VALUES.filter(
					(value) => value.das !== 'das-setmag-f' && value.das !== 'das-pts1-f',
				),
				valuesLeftOut: [
					{ das: 'das-setmag-f', reason: 'functional-constraint' },
					{ das: 'das-pts1-f', reason: 'functional-constraint' },
					{ das: 'das-mod-stval', reason: 'path-not-in-type' },
				],
				expectedQueries: [`${PTOC}/default:DOI[@name="StrVal"]/default:DAI[@name="d"]`],
				unexpectedQueries: [
					`${PTOC}//default:SDI[@name="setMag"]`,
					`${PTOC}//default:SDI[@name="pts"]`,
				],
			},
	}

	runBuildValuesCases({ testCases })
})

/** Building again: a value already there is not planned, a changed one replaces the DAI's values. */
describe('buildIed - the values of a logical node built before', () => {
	const testCases: SclTest.TestCases<BuildValuesTestCase> = {
		'PTOC1 built, setMag f unchanged, Op general sGroup 2 changed → only Op general planned, its Vals replaced':
			{
				sourceXml: valuesBuilt,
				lnodes: ['ptoc1'],
				values: [{ das: 'das-op-general', existing: 'built-op-general' }],
				valuesLeftOut: [],
				expectedQueries: [
					`${PTOC}/default:DOI[@name="Op"]/default:DAI[@name="general"][default:Val[@sGroup="2"]="false"]`,
					`${PTOC}/default:DOI[@name="StrVal"]/default:SDI[@name="setMag"]/default:DAI[@name="f"][default:Val="1.5"]`,
				],
				unexpectedQueries: [
					`${PTOC}/default:DOI[@name="Op"]/default:DAI[@name="general"]/default:Val[3]`,
					`${PTOC}/default:DOI[@name="StrVal"]/default:SDI[@name="setMag"]/default:DAI[@name="f"]/default:Val[2]`,
					`${PTOC}/default:DOI[@name="Op"][2]`,
				],
			},
	}

	runBuildValuesCases({ testCases })
})
