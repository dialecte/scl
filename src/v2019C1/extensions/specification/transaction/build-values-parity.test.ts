import { sameClassInTargetIed } from '../build/open-value-rules'
import { planIed } from '../query/plan-ied'
import { buildIed } from './build-ied'
import valuesBuilt from './fixtures/build-values/values-built.xml?raw'
import values from './fixtures/build-values/values.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { IedBuildPlan } from './build-ied.types'
import type { SclTest } from '@/v2019C1/test'

/** The values `planIed` lists are the values `buildIed` writes. */
describe('planIed - the values the build writes', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodes: string[]
		excludeFunctionalConstraints: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'LLN0, PTOC1 and PTRC1 of PROT, DC excluded → the same values and left-out values from both': {
			sourceXml: values,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			excludeFunctionalConstraints: ['DC'],
		},
		'PTOC1 built before, one value changed → the same values from both': {
			sourceXml: valuesBuilt,
			lnodes: ['ptoc1'],
			excludeFunctionalConstraints: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const params = {
				ied: { tagName: 'IED' as const, id: 'ied-s' },
				lnodes: testCase.lnodes.map((id) => ({ tagName: 'LNode' as const, id })),
				openValues: { lnType: sameClassInTargetIed },
				excludeFunctionalConstraints: testCase.excludeFunctionalConstraints,
			}
			const planned = planIed(source.query, params)
			const both = planned.then(async function buildAfter(plan) {
				const built = await source.transaction((tx) => buildIed(tx, params))
				return { plan: valuesOf(plan), built: valuesOf(built.plan) }
			})
			await expect(both).resolves.toSatisfy(function same(pair: { plan: string; built: string }) {
				return pair.plan === pair.built
			})
		},
	})
})

function valuesOf(plan: IedBuildPlan): string {
	return JSON.stringify({ values: plan.values, valuesLeftOut: plan.valuesLeftOut })
}
