import twoFunctionsOnOnePath from './fixtures/two-functions-on-one-path.xml?raw'
import { createSclImportSession } from './io-hooks'

import { createTestProject } from '@dialecte/core/test'
import { describe, expect, it } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { Config } from '@/v2019C1/config'
import type { SclImportDiagnostic } from '@/v2019C1/errors'
import type { AfterImportResult } from '@dialecte/core'

describe('import of a path several targets hold', () => {
	type TestCase = {
		sourceXml: string
		/** The functionUuid the import writes on ref1 (none when nothing), and the codes it reports about ref1. */
		expected: { functionUuid: string | undefined; codes: string[] }
	}

	const testCases: Record<string, TestCase> = {
		// two-functions-on-one-path.xml: both functions hold S1/VL1/B1/F1, ref1 names it by path only
		'a reference naming a path two functions hold → no uuid written, reported as naming several': {
			sourceXml: twoFunctionsOnOnePath,
			expected: { functionUuid: undefined, codes: ['ambiguous-reference'] },
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const outcome = await importOutcomeOf({ xml: testCase.sourceXml })
			const functionUuid = (outcome.updates ?? [])
				.filter((update) => update.recordId === 'ref1')
				.flatMap((update) => update.attributes ?? [])
				.find((attribute) => attribute.name === 'functionUuid')?.value
			const codes = (outcome.diagnostics ?? [])
				.filter((diagnostic) => diagnostic.ref?.id === 'ref1')
				.map((diagnostic) => diagnostic.code)
			expect({ functionUuid, codes }).toEqual(testCase.expected)
		})
	}
})

/** What the scl import session of a file gives once the file is imported. */
async function importOutcomeOf(params: {
	xml: string
}): Promise<AfterImportResult<SclImportDiagnostic>> {
	const outcomes: AfterImportResult<SclImportDiagnostic>[] = []
	const { project } = await createTestProject<Config>({
		sourceXml: params.xml,
		dialecteConfig: SCL_DIALECTE_CONFIG,
		hooks: {
			createImportSession: function createObservedImportSession() {
				const session = createSclImportSession()
				return {
					...session,
					async afterImport() {
						const outcome = await session.afterImport()
						outcomes.push(outcome)
						return outcome
					},
				}
			},
		},
	})
	await project.destroy()
	const [outcome] = outcomes
	if (!outcome) throw new Error('the import ran no session')
	return outcome
}
