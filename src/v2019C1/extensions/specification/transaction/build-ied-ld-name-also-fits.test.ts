import { sameClassInTargetIed } from '../build/open-value-rules'
import { buildIed } from './build-ied'
import ldNameAlsoFits from './fixtures/build-values/ld-name-also-fits.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { BuildOpenValues, BuildRefusalReason, IedBuildPlan } from './build-ied.types'
import type { SclTest } from '@/v2019C1/test'

/** `ldInst` rule: the function's own 55-character name. */
function ownName(context: { containerName: string }): string {
	return context.containerName
}

/** Every logical device name fits the longest of the IED's name and the names given in `ldNameAlsoFits`. */
describe('buildIed - logical device names that must fit other IED names', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		openValues: BuildOpenValues
		refusals: { reason: BuildRefusalReason; ref: string }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'IED S, function of 55 characters, ldNameAlsoFits SPECIFICATION → ld-name, 13 + 55 over 64': {
			sourceXml: ldNameAlsoFits,
			openValues: { lnType: sameClassInTargetIed },
			refusals: [{ reason: 'ld-name', ref: 'fn' }],
			unexpectedQueries: ['//default:LDevice[@inst!="LD0"]'],
		},
		'the same name answered by the ldInst rule, ldNameAlsoFits SPECIFICATION → open-value-invalid':
			{
				sourceXml: ldNameAlsoFits,
				openValues: { ldInst: ownName, lnType: sameClassInTargetIed },
				refusals: [{ reason: 'open-value-invalid', ref: 'fn' }],
				unexpectedQueries: ['//default:LDevice[@inst!="LD0"]'],
			},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const written = source.transaction((tx) =>
				buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: [{ tagName: 'LNode', id: 'ptoc1' }],
					openValues: testCase.openValues,
					ldNameAlsoFits: ['SPECIFICATION'],
				}),
			)
			const refused = written.then(
				() => [],
				(error: unknown) => refusalsOf(error),
			)
			await expect(refused).resolves.toEqual(testCase.refusals)
		},
	})
})

function refusalsOf(error: unknown): { reason: BuildRefusalReason; ref?: string }[] {
	const meta = toDialecteError(error)?.meta as { refusals?: IedBuildPlan['refusals'] } | undefined
	return (meta?.refusals ?? []).map((refusal) => ({
		reason: refusal.reason,
		...(refusal.ref && { ref: refusal.ref.id }),
	}))
}
