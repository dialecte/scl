import { firstOf } from './open-values'

import { describe, expect, it } from 'vitest'

import type { OpenValueRule } from './open-values.types'

/** `firstOf`: the first rule answering, in order. */
describe('firstOf', () => {
	type Context = { lnClass: string }
	type TestCase = { rules: OpenValueRule<Context>[]; expected: string | undefined }

	function never(): string | undefined {
		return undefined
	}
	function ptoc(context: Context): string | undefined {
		return context.lnClass === 'PTOC' ? 'PTOC_T' : undefined
	}
	function always(): string {
		return 'ANY_T'
	}

	const testCases: Record<string, TestCase> = {
		'no rule → undefined': { rules: [], expected: undefined },
		'the first answers → its value': { rules: [ptoc, always], expected: 'PTOC_T' },
		'the first leaves it open → the next one’s value': {
			rules: [never, always],
			expected: 'ANY_T',
		},
		'none answers → undefined': { rules: [never, never], expected: undefined },
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(firstOf(...testCase.rules)({ lnClass: 'PTOC' })).toBe(testCase.expected)
		})
	}
})
