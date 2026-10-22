import { isSclImportDiagnostic } from './import-diagnostics'
import { SCL_IMPORT_DIAGNOSTICS } from './import-diagnostics.constants'

import { createDiagnostic } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import type { Diagnostic } from '@dialecte/core'

describe('isSclImportDiagnostic', () => {
	type TestCase = {
		only?: boolean
		diagnostic: Diagnostic
		expected: boolean
	}

	const sclDiagnostic = createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unresolved-reference', {
		ref: { tagName: 'Terminal', id: 'terminal', attribute: 'connectivityNode' },
		meta: { uuidAttribute: 'cNodeUuid', pathValue: 'S1/VL1/B1/L9', triedKeys: ['S1/VL1/B1/L9'] },
	})

	const testCases: Record<string, TestCase> = {
		'a diagnostic of the scl import → true': {
			diagnostic: sclDiagnostic,
			expected: true,
		},
		'the same code under another source → false': {
			diagnostic: { ...sclDiagnostic, source: 'nsd' },
			expected: false,
		},
		'a code the scl import does not have, under scl → false': {
			diagnostic: { ...sclDiagnostic, code: 'missing-value' },
			expected: false,
		},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, testCase]) => testCase.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, testCase]) => {
		it(description, () => {
			expect(isSclImportDiagnostic(testCase.diagnostic)).toBe(testCase.expected)
		})
	})
})
