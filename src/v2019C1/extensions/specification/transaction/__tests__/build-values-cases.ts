import { sameClassInTargetIed } from '../../build/open-value-rules'
import { buildIed } from '../build-ied'

import { expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { IedBuildResult, ValueLeftOutReason } from '../build-ied.types'
import type { SclTest } from '@/v2019C1/test'

/** A build of the given LNodes on S: the values it plans (by DAS, with the DAI they replace) and those it leaves out. */
export type BuildValuesTestCase = SclTest.BaseXmlTestCase & {
	lnodes: string[]
	excludeFunctionalConstraints?: string[]
	values: { das: string; existing?: string }[]
	valuesLeftOut: { das: string; reason: ValueLeftOutReason }[]
}

/** Builds each case on S in a transaction and checks the planned and left-out values; the document by its queries. */
export function runBuildValuesCases(params: {
	testCases: SclTest.TestCases<BuildValuesTestCase>
}): void {
	runSclTestCases.withExport<BuildValuesTestCase>({
		testCases: params.testCases,
		act: async ({ source, testCase }) => {
			const built = source.transaction((tx) =>
				buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: testCase.lnodes.map((id) => ({ tagName: 'LNode', id })),
					openValues: { lnType: sameClassInTargetIed },
					...(testCase.excludeFunctionalConstraints && {
						excludeFunctionalConstraints: testCase.excludeFunctionalConstraints,
					}),
				}),
			)
			await expect(built.then(valuesOf)).resolves.toEqual({
				values: testCase.values,
				valuesLeftOut: testCase.valuesLeftOut,
			})
		},
	})
}

function valuesOf(built: IedBuildResult): {
	values: { das: string; existing?: string }[]
	valuesLeftOut: { das: string; reason: ValueLeftOutReason }[]
} {
	return {
		values: built.plan.values.map((value) => ({
			das: value.das.id ?? '',
			...(value.existing && { existing: value.existing.id }),
		})),
		valuesLeftOut: built.plan.valuesLeftOut.map((left) => ({
			das: left.das.id ?? '',
			reason: left.reason,
		})),
	}
}
