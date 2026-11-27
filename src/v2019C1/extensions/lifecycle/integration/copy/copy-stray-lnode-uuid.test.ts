import { applyCopy, describeRefusals, ref, reportCopy } from './copy-helpers'

import { describe, expect } from 'vitest'

import strayXml from '@/v2019C1/hooks/shared/fixtures/stray-lnode-uuid/stray.xml?raw'
import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { SclTest } from '@/v2019C1/test'

// stray.xml: B1 holds F1, whose behaviour FB reads GAPC2's Trip input by its name and uuid and repeats GAPC2's uuid in
// lnodeUuid, and reads XCBR1's position by its uuid and data names; B2 holds nothing.

const F1_TO_B2: CopyCase = { verb: 'fsd', ref: ref('Function', 'f1'), anchor: ref('Bay', 'b2') }

describe('fsd copy of a Function whose behaviour variable repeats the LNode of its input', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		copy: CopyCase
		expected: { refusals: string[]; commit: string; copiesHoldingLNodeUuid: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// stray.xml: F1 copied under B2, its FB and GAPC2 with it
		'F1 to B2 → the report lists no refusal, the copy commits, the copied variable without lnodeUuid':
			{
				sourceXml: strayXml,
				copy: F1_TO_B2,
				expected: { refusals: [], commit: 'committed', copiesHoldingLNodeUuid: 0 },
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const outcome = reportCopy({ document: source, copy: testCase.copy }).then(
			async function thenApply(report) {
				const commit = await applyCopy({ document: source, copy: testCase.copy })
				const variables = await source.query.getRecordsByTagName('InputVar')
				const copiesHoldingLNodeUuid = variables.filter(
					(variable) =>
						variable.id !== 'fb-trip' &&
						['inputUuid', 'lnodeUuid'].every((name) =>
							variable.attributes.some((attribute) => attribute.name === name),
						),
				).length
				return { refusals: describeRefusals(report.refusals ?? []), commit, copiesHoldingLNodeUuid }
			},
		)
		await expect(outcome).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
