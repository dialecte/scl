import { legacyRecordsMissing } from './records-agree'
import { MUTATION_FAMILIES } from './test-tiers.constants'

import { describe, expect, it } from 'vitest'

import type { RecordsByFile } from './test-tiers.types'

const FILE = 'src/a.ts'
const LEGACY: RecordsByFile = {
	[FILE]: { k1: { line: 3, mutation: 'BooleanLiteral: true -> false', equivalent: 'the reason' } },
}
const MIGRATED_K1 = {
	line: 3,
	mutation: 'BooleanLiteral: true -> false',
	reason: 'the reason',
	family: 'unclassified',
	lineHash: '0123456789abcdef',
}

type Case = { migrated: RecordsByFile; expected: string[] }

const CASES: Record<string, Case> = {
	'the same record → nothing missing': { migrated: { [FILE]: { k1: MIGRATED_K1 } }, expected: [] },
	'a record only the migrated file holds (written by the cli) → accepted': {
		migrated: {
			[FILE]: { k1: MIGRATED_K1, k2: { ...MIGRATED_K1, line: 9 } },
			'src/b.ts': { k3: MIGRATED_K1 },
		},
		expected: [],
	},
	'a legacy key the migrated file lacks → refused': {
		migrated: { [FILE]: { k2: MIGRATED_K1 } },
		expected: [`${FILE}#k1`],
	},
	'a legacy file the migrated file lacks → refused': { migrated: {}, expected: [`${FILE}#k1`] },
	'another reason → refused': {
		migrated: { [FILE]: { k1: { ...MIGRATED_K1, reason: 'another' } } },
		expected: [`${FILE}#k1`],
	},
	'another line → refused': {
		migrated: { [FILE]: { k1: { ...MIGRATED_K1, line: 4 } } },
		expected: [`${FILE}#k1`],
	},
	'another mutation → refused': {
		migrated: { [FILE]: { k1: { ...MIGRATED_K1, mutation: 'other' } } },
		expected: [`${FILE}#k1`],
	},
	'no line hash → refused': {
		migrated: { [FILE]: { k1: { ...MIGRATED_K1, lineHash: '' } } },
		expected: [`${FILE}#k1`],
	},
	'a judged family the cli knows → accepted': {
		migrated: { [FILE]: { k1: { ...MIGRATED_K1, family: 'invariant-guard' } } },
		expected: [],
	},
	'a family the cli does not know → refused': {
		migrated: { [FILE]: { k1: { ...MIGRATED_K1, family: 'made-up' } } },
		expected: [`${FILE}#k1`],
	},
}

describe('legacyRecordsMissing', () => {
	for (const [name, { migrated, expected }] of Object.entries(CASES)) {
		it(name, () => {
			expect(
				legacyRecordsMissing({ legacy: LEGACY, migrated, families: MUTATION_FAMILIES }),
			).toEqual(expected)
		})
	}
})
