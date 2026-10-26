import { holdsNothingBut } from './orphaned-refs'

import { describe, expect, it } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const parent = { tagName: 'Function', id: 'function' } as const
const relation = { tagName: 'PowerSystemRelation', id: 'relation' } as const

const testCases: Record<
	string,
	{ record: Scl.RawRecord<Scl.ElementsOf>; gone: string[]; expected: boolean }
> = {
	'no child': {
		record: createSclTestRecord({ record: { tagName: 'PowerSystemRelations', parent } }),
		gone: [],
		expected: true,
	},
	'only children that go': {
		record: createSclTestRecord({
			record: { tagName: 'PowerSystemRelations', parent, children: [relation] },
		}),
		gone: ['relation'],
		expected: true,
	},
	'a child that stays': {
		record: createSclTestRecord({
			record: { tagName: 'PowerSystemRelations', parent, children: [relation] },
		}),
		gone: [],
		expected: false,
	},
	'text, laid out with spaces': {
		record: createSclTestRecord({ record: { tagName: 'Private', parent, value: ' v1 ' } }),
		gone: [],
		expected: false,
	},
	'only spaces': {
		record: createSclTestRecord({ record: { tagName: 'Private', parent, value: '  ' } }),
		gone: [],
		expected: true,
	},
	'the root': {
		record: createSclTestRecord({ record: { tagName: 'SCL' } }),
		gone: [],
		expected: false,
	},
}

describe('an element holding nothing once what goes is gone', () => {
	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, function judgeTheRecord() {
			expect(holdsNothingBut({ record: testCase.record, gone: new Set(testCase.gone) })).toBe(
				testCase.expected,
			)
		})
	}
})
