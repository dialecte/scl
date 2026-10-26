import { isPrunedWhenEmpty } from './pruned-when-empty'

import { describe, expect, it } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const parent = { tagName: 'Bay', id: 'bay' } as const

const testCases: Record<string, { record: Scl.RawRecord<Scl.ElementsOf>; expected: boolean }> = {
	"a wrapper of the dialecte's elements": {
		record: createSclTestRecord({
			record: { tagName: 'Private', attributes: { type: 'eIEC61850-6-100' }, parent },
		}),
		expected: true,
	},
	"a tool's wrapper": {
		record: createSclTestRecord({
			record: { tagName: 'Private', attributes: { type: 'ACME' }, parent },
		}),
		expected: false,
	},
	'a wrapper of no type': {
		record: createSclTestRecord({ record: { tagName: 'Private', parent } }),
		expected: false,
	},
	'a set of references': {
		record: createSclTestRecord({ record: { tagName: 'FunctionCategory', parent } }),
		expected: true,
	},
	'a level of the topology': {
		record: createSclTestRecord({
			record: { tagName: 'Bay', parent: { tagName: 'VoltageLevel', id: 'level' } },
		}),
		expected: false,
	},
	'an element of its own': {
		record: createSclTestRecord({
			record: { tagName: 'IED', parent: { tagName: 'SCL', id: 'root' } },
		}),
		expected: false,
	},
}

describe('an element with no reason to stay once it holds nothing', () => {
	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, function judgeTheRecord() {
			expect(isPrunedWhenEmpty(testCase.record)).toBe(testCase.expected)
		})
	}
})
