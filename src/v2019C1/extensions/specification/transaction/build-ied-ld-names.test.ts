import { sameClassInTargetIed } from '../build/open-value-rules'
import { runBuildIedCases, runBuildIedRefusalCases } from './__tests__/build-ied-cases'
import base from './fixtures/build-ied/base.xml?raw'
import functionNameTooLong from './fixtures/build-ied/function-name-too-long.xml?raw'
import functionNamedUnderscores from './fixtures/build-ied/function-named-underscores.xml?raw'
import functionNamedWithSpaces from './fixtures/build-ied/function-named-with-spaces.xml?raw'
import ldOfAnotherFunction from './fixtures/build-ied/ld-of-another-function.xml?raw'
import lnodeUnderBay from './fixtures/build-ied/lnode-under-bay.xml?raw'
import nonLeafSubFunctionsSameName from './fixtures/build-ied/non-leaf-subfunctions-same-name.xml?raw'
import residualClash from './fixtures/build-ied/residual-clash.xml?raw'
import twoBaysProt from './fixtures/build-ied/two-bays-prot.xml?raw'

import { describe } from 'vitest'

import type { BuildIedRefusalCase, BuildIedTestCase } from './__tests__/build-ied-cases'
import type { LdInstContext } from './build-ied.types'
import type { SclTest } from '@/v2019C1/test'

/** The LDevice of that inst in S. */
function ld(inst: string): string {
	return `//default:IED[@name="S"]//default:LDevice[@inst="${inst}"]`
}

/** `ldInst` rule: `MAIN` for the CTRL function, the engine's name for any other. */
function mainForCtrl(context: LdInstContext): string | undefined {
	return context.containerName === 'CTRL' ? 'MAIN' : undefined
}

/** `ldInst` rule: `LD1` for every container. */
function ld1ForAll(): string {
	return 'LD1'
}

/** `ldInst` rule: a name the inst pattern refuses. */
function badName(): string {
	return '1 bad'
}

/** `ldInst` rule: `BAY` for the logical nodes sitting directly in a bay. */
function bayName(context: LdInstContext): string | undefined {
	return context.container.tagName === 'Bay' ? 'BAY' : undefined
}

/** Logical device names: normalised from the function, clashes decided over the whole document, caller names. */
describe('buildIed - logical device names', () => {
	const testCases: SclTest.TestCases<BuildIedTestCase> = {
		'PROT in bays Q01 and Q02, both built → LDs Q01_PROT and Q02_PROT': {
			sourceXml: twoBaysProt,
			lnodes: ['lln0', 'ptoc1', 'ptrc1', 'q02-ptoc1'],
			created: { lDevices: 2, logicalNodes: 7 },
			openValuesUsed: [
				{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' },
				{ point: 'lnType', element: 'q02-prot', value: 'LLN0_T' },
				{ point: 'lnType', element: 'q02-prot', value: 'LPHD_T' },
			],
			expectedQueries: [
				`${ld('Q01_PROT')}/default:LN[@lnClass="PTOC"]`,
				`${ld('Q02_PROT')}/default:LN[@lnClass="PTOC"]`,
			],
			unexpectedQueries: [ld('PROT')],
		},
		'PROT in bays Q01 and Q02, only Q01 built → LD Q01_PROT, the clash is the whole document’s': {
			sourceXml: twoBaysProt,
			lnodes: ['ptoc1'],
			created: { lDevices: 1, logicalNodes: 3 },
			openValuesUsed: [
				{ point: 'lnType', element: 'q01-prot', value: 'LLN0_T' },
				{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' },
			],
			expectedQueries: [`${ld('Q01_PROT')}/default:LN[@lnClass="PTOC"]`],
			unexpectedQueries: [ld('PROT')],
		},
		'function named "Prot 1/A" → LD Prot_1_A': {
			sourceXml: functionNamedWithSpaces,
			lnodes: ['ptoc1'],
			created: { lDevices: 1, logicalNodes: 3 },
			openValuesUsed: [
				{ point: 'lnType', element: 'fn', value: 'LLN0_T' },
				{ point: 'lnType', element: 'fn', value: 'LPHD_T' },
			],
			expectedQueries: [`${ld('Prot_1_A')}/default:LN[@lnClass="PTOC"]`],
		},
		'non-leaf subfunctions A/X and B/X → LDs A_X and B_X': {
			sourceXml: nonLeafSubFunctionsSameName,
			lnodes: ['a-ptoc1', 'b-ptoc1'],
			created: { lDevices: 2, logicalNodes: 6 },
			openValuesUsed: [
				{ point: 'lnType', element: 'a-x', value: 'LLN0_T' },
				{ point: 'lnType', element: 'a-x', value: 'LPHD_T' },
				{ point: 'lnType', element: 'b-x', value: 'LLN0_T' },
				{ point: 'lnType', element: 'b-x', value: 'LPHD_T' },
			],
			expectedQueries: [
				`${ld('A_X')}/default:LN[@lnClass="PTOC"]`,
				`${ld('B_X')}/default:LN[@lnClass="PTOC"]`,
			],
			unexpectedQueries: [ld('X'), ld('Y')],
		},
		'ldInst rule answering MAIN for CTRL → LD MAIN, the answer listed': {
			sourceXml: base,
			lnodes: ['cswi1'],
			openValues: { ldInst: mainForCtrl, lnType: sameClassInTargetIed },
			created: { lDevices: 1, logicalNodes: 3 },
			openValuesUsed: [
				{ point: 'ldInst', element: 'q01-ctrl', value: 'MAIN' },
				{ point: 'lnType', element: 'q01-ctrl', value: 'LLN0_T' },
				{ point: 'lnType', element: 'q01-ctrl', value: 'LPHD_T' },
			],
			expectedQueries: [`${ld('MAIN')}/default:LN[@lnClass="CSWI"]`],
			unexpectedQueries: [ld('CTRL')],
		},
		'LNode directly in bay Q01, ldInst rule answering BAY → LD BAY': {
			sourceXml: lnodeUnderBay,
			lnodes: ['bay-ptoc1'],
			openValues: { ldInst: bayName, lnType: sameClassInTargetIed },
			created: { lDevices: 1, logicalNodes: 3 },
			openValuesUsed: [
				{ point: 'ldInst', element: 'q01', value: 'BAY' },
				{ point: 'lnType', element: 'q01', value: 'LLN0_T' },
				{ point: 'lnType', element: 'q01', value: 'LPHD_T' },
			],
			expectedQueries: [`${ld('BAY')}/default:LN[@lnClass="PTOC"]`],
		},
	}

	runBuildIedCases({ testCases })
})

/** Logical device names the build refuses. */
describe('buildIed - logical device names refused', () => {
	const testCases: SclTest.TestCases<BuildIedRefusalCase> = {
		'function named "__" → ld-name, nothing left after normalising': {
			sourceXml: functionNamedUnderscores,
			lnodes: ['ptoc1'],
			refusals: [{ reason: 'ld-name', ref: 'fn' }],
		},
		'IED SIED_LONG_NAME and a 55-character function → ld-name, the LD name over 64': {
			sourceXml: functionNameTooLong,
			ied: 'ied-s',
			lnodes: ['ptoc1'],
			refusals: [{ reason: 'ld-name', ref: 'fn' }],
		},
		'PROT in bay Q01 of E1 and of E2 → ld-name for both, still clashing after the bay prefix': {
			sourceXml: residualClash,
			lnodes: ['e1-ptoc1', 'e2-ptoc1'],
			refusals: [
				{ reason: 'ld-name', ref: 'e1-prot' },
				{ reason: 'ld-name', ref: 'e2-prot' },
			],
		},
		'LNode directly in bay Q01, no ldInst rule → no-function': {
			sourceXml: lnodeUnderBay,
			lnodes: ['bay-ptoc1'],
			refusals: [{ reason: 'no-function', ref: 'bay-ptoc1' }],
		},
		'S holds LD PROT built from BACKUP, Q01 PROT built → ld-name, never two functions in one LD': {
			sourceXml: ldOfAnotherFunction,
			lnodes: ['ptoc1'],
			refusals: [{ reason: 'ld-name', ref: 'q01-prot' }],
		},
		'ldInst rule answering "1 bad" → open-value-invalid': {
			sourceXml: base,
			lnodes: ['cswi1'],
			openValues: { ldInst: badName, lnType: sameClassInTargetIed },
			refusals: [{ reason: 'open-value-invalid', ref: 'q01-ctrl' }],
		},
		'ldInst rule answering LD1 for PROT and CTRL → ld-name for both, the answers clash': {
			sourceXml: base,
			lnodes: ['ptoc1', 'cswi1'],
			openValues: { ldInst: ld1ForAll, lnType: sameClassInTargetIed },
			refusals: [
				{ reason: 'ld-name', ref: 'q01-prot' },
				{ reason: 'ld-name', ref: 'q01-ctrl' },
			],
		},
	}

	runBuildIedRefusalCases({ testCases })
})
