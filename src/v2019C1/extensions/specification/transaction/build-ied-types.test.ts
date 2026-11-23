import { firstOfClass, sameClassInTargetIed } from '../build/open-value-rules'
import { runBuildIedCases, runBuildIedRefusalCases } from './__tests__/build-ied-cases'
import base from './fixtures/build-ied/base.xml?raw'
import danglingLnType from './fixtures/build-ied/dangling-lntype.xml?raw'
import mismatchedLnType from './fixtures/build-ied/mismatched-lntype.xml?raw'
import shellWithoutLphd from './fixtures/build-ied/shell-without-lphd.xml?raw'
import typelessPtoc1 from './fixtures/build-ied/typeless-ptoc1.xml?raw'

import { describe } from 'vitest'

import { firstOf } from '@/v2019C1/helpers/open-values'

import type { BuildIedRefusalCase, BuildIedTestCase } from './__tests__/build-ied-cases'
import type { LnTypeContext } from './build-ied.types'
import type { SclTest } from '@/v2019C1/test'

/** The LDevice PROT of S. */
const PROT = '//default:IED[@name="S"]//default:LDevice[@inst="PROT"]'

/** `lnType` rule: PTOC_T for a PTOC, the shell's type for the rest. */
function ptocT(context: LnTypeContext): string | undefined {
	return context.lnClass === 'PTOC' ? 'PTOC_T' : sameClassInTargetIed(context)
}

/** `lnType` rule: the shell's type of the class, else the first type of the class. */
function shellThenFirstOfClass(context: LnTypeContext): string | undefined {
	return firstOf(sameClassInTargetIed, firstOfClass)(context)
}

/** `lnType` rule: a type no LNodeType carries. */
function noSuchType(): string {
	return 'NO_SUCH_T'
}

/** `lnType` rule: PTRC_T, whatever the class. */
function ptrcForAll(): string {
	return 'PTRC_T'
}

/** Types the standard leaves open, answered by the caller's rules. */
describe('buildIed - types from the caller’s rules', () => {
	const testCases: SclTest.TestCases<BuildIedTestCase> = {
		'PTOC1 without lnType, rule answering PTOC_T → built with PTOC_T, the answer listed': {
			sourceXml: typelessPtoc1,
			lnodes: ['ptoc1'],
			openValues: { lnType: ptocT },
			created: { lDevices: 1, logicalNodes: 3 },
			openValuesUsed: [
				{ point: 'lnType', element: 'ptoc1', value: 'PTOC_T' },
				{ point: 'lnType', element: 'q01-prot', value: 'LLN0_T' },
				{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' },
			],
			expectedQueries: [`${PROT}/default:LN[@lnClass="PTOC"][@lnType="PTOC_T"]`],
		},
		'PTOC1 without lnType, firstOf(sameClassInTargetIed, firstOfClass) → the first PTOC type, the shell’s LN0 and LPHD types':
			{
				sourceXml: typelessPtoc1,
				lnodes: ['ptoc1'],
				openValues: { lnType: shellThenFirstOfClass },
				created: { lDevices: 1, logicalNodes: 3 },
				openValuesUsed: [
					{ point: 'lnType', element: 'ptoc1', value: 'PTOC_T' },
					{ point: 'lnType', element: 'q01-prot', value: 'LLN0_T' },
					{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' },
				],
				expectedQueries: [
					`${PROT}/default:LN[@lnClass="PTOC"][@lnType="PTOC_T"]`,
					`${PROT}/default:LN0[@lnType="LLN0_T"]`,
				],
			},
	}

	runBuildIedCases({ testCases })
})

/** Types the build refuses. */
describe('buildIed - types refused', () => {
	const testCases: SclTest.TestCases<BuildIedRefusalCase> = {
		'PTOC1 without lnType, no PTOC in the target → type-missing': {
			sourceXml: typelessPtoc1,
			lnodes: ['ptoc1'],
			refusals: [{ reason: 'type-missing', ref: 'ptoc1' }],
		},
		'target without any LPHD → type-missing for the added LPHD': {
			sourceXml: shellWithoutLphd,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			refusals: [{ reason: 'type-missing', ref: 'q01-prot' }],
		},
		'CTRL without any rule → type-missing for the added LN0 and LPHD of CTRL': {
			sourceXml: base,
			lnodes: ['cswi1'],
			openValues: null,
			refusals: [
				{ reason: 'type-missing', ref: 'q01-ctrl' },
				{ reason: 'type-missing', ref: 'q01-ctrl' },
			],
		},
		'PTOC1 naming no LNodeType → type-missing, the rule not asked': {
			sourceXml: danglingLnType,
			lnodes: ['ptoc1'],
			openValues: { lnType: ptocT },
			refusals: [{ reason: 'type-missing', ref: 'ptoc1' }],
		},
		'PTOC1 typed PTRC_T → type-mismatch': {
			sourceXml: mismatchedLnType,
			lnodes: ['ptoc1'],
			refusals: [{ reason: 'type-mismatch', ref: 'ptoc1' }],
		},
		'rule answering a type no LNodeType carries → open-value-invalid for the added LN0 and LPHD': {
			sourceXml: base,
			lnodes: ['cswi1'],
			openValues: { lnType: noSuchType },
			refusals: [
				{ reason: 'open-value-invalid', ref: 'q01-ctrl' },
				{ reason: 'open-value-invalid', ref: 'q01-ctrl' },
			],
		},
		'rule answering PTRC_T for the added LN0 and LPHD → open-value-invalid, another class': {
			sourceXml: base,
			lnodes: ['cswi1'],
			openValues: { lnType: ptrcForAll },
			refusals: [
				{ reason: 'open-value-invalid', ref: 'q01-ctrl' },
				{ reason: 'open-value-invalid', ref: 'q01-ctrl' },
			],
		},
	}

	runBuildIedRefusalCases({ testCases })
})
