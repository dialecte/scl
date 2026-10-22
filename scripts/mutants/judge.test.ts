import {
	diffRanges,
	exactRange,
	judgeReport,
	parseTarget,
	recordSurvivors,
	withFullRun,
	withinTargets,
	withLoneTimeouts,
} from './judge'

import { describe, expect, it } from 'vitest'

import type { EquivalentMutants, MutationReport, ReportedMutant } from './mutants.types'

const FILE = 'src/a.ts'
const OTHER = 'src/b.ts'
const SOURCE = ['const a = x === 1', 'const a = x === 1', 'return x === 1'].join('\n')

function mutant(params: {
	id: string
	status: string
	line: number
	column?: number
	original?: string
}): ReportedMutant {
	const { id, status, line, column = 11, original = 'x === 1' } = params
	return {
		id,
		mutatorName: 'ConditionalExpression',
		replacement: 'true',
		status,
		location: { start: { line, column }, end: { line, column: column + original.length } },
	}
}

function report(params: { mutants: ReportedMutant[]; source?: string }): MutationReport {
	const { mutants, source = SOURCE } = params
	return { files: { [FILE]: { source, mutants } } }
}

function statuses(params: { report: MutationReport }): string[] {
	return params.report.files[FILE]?.mutants.map(({ status }) => status) ?? []
}

function keyOf(params: { report: MutationReport }): string {
	return judgeReport({ report: params.report, records: {} }).survivors[0]?.key ?? ''
}

const FIRST = report({ mutants: [mutant({ id: '1', status: 'Survived', line: 1 })] })
const FIRST_KEY = keyOf({ report: FIRST })

function recorded(params: { keys: string[]; equivalent?: string }): EquivalentMutants {
	const { keys, equivalent = 'x is always 1 here' } = params
	return {
		[FILE]: Object.fromEntries(keys.map((key) => [key, { line: 1, mutation: 'm', equivalent }])),
	}
}

describe('judgeReport', () => {
	it('a survivor no record lists → unlisted, with the range that re-mutates it', () => {
		expect(judgeReport({ report: FIRST, records: {} }).unlisted).toEqual([
			{
				file: FILE,
				key: FIRST_KEY,
				line: 1,
				mutation: 'ConditionalExpression: x === 1 -> true',
				range: `${FILE}:1:10-1:18`,
			},
		])
	})

	it('a mutant no test runs → a survivor too', () => {
		const uncovered = report({ mutants: [mutant({ id: '1', status: 'NoCoverage', line: 1 })] })
		expect(judgeReport({ report: uncovered, records: {} }).survivors).toHaveLength(1)
	})

	it('a survivor recorded with a reason → listed; with an empty reason → unlisted', () => {
		expect(
			judgeReport({ report: FIRST, records: recorded({ keys: [FIRST_KEY] }) }).unlisted,
		).toEqual([])
		expect(
			judgeReport({ report: FIRST, records: recorded({ keys: [FIRST_KEY], equivalent: ' ' }) })
				.unlisted,
		).toHaveLength(1)
	})

	it('the same line twice in a file → the second numbered, whatever the run reports', () => {
		const second = report({ mutants: [mutant({ id: '2', status: 'Survived', line: 2 })] })
		expect(keyOf({ report: second })).toBe(`${FIRST_KEY}-1`)
	})

	it('a line moved → the same key', () => {
		const moved = report({
			mutants: [mutant({ id: '1', status: 'Survived', line: 2 })],
			source: `\n${SOURCE}`,
		})
		expect(keyOf({ report: moved })).toBe(FIRST_KEY)
	})

	it('the same change on another line → another key, never the recorded one', () => {
		const other = report({
			mutants: [mutant({ id: '3', status: 'Survived', line: 3, column: 8 })],
		})
		expect([FIRST_KEY, `${FIRST_KEY}-1`]).not.toContain(keyOf({ report: other }))
	})

	it('a recorded mutant the run killed → stale; one the run did not reach → neither stale nor unlisted', () => {
		const second = keyOf({
			report: report({ mutants: [mutant({ id: '2', status: 'Survived', line: 2 })] }),
		})
		const verdict = judgeReport({
			report: report({ mutants: [mutant({ id: '1', status: 'Killed', line: 1 })] }),
			records: recorded({ keys: [FIRST_KEY, second] }),
		})
		expect(verdict).toEqual({
			survivors: [],
			unlisted: [],
			stale: [{ file: FILE, key: FIRST_KEY }],
		})
	})

	it('a file mutated whole → a recorded mutant the run no longer finds is stale', () => {
		const verdict = judgeReport({
			report: FIRST,
			records: recorded({ keys: [FIRST_KEY, 'gone'] }),
			wholeFiles: [FILE],
		})
		expect(verdict.stale).toEqual([{ file: FILE, key: 'gone' }])
	})
})

describe('recordSurvivors', () => {
	it('keeps a written reason (line and change refreshed), adds a new survivor with an empty one, drops the stale, leaves other files', () => {
		const second = report({
			mutants: [
				mutant({ id: '1', status: 'Survived', line: 1 }),
				mutant({ id: '2', status: 'Survived', line: 2 }),
				mutant({ id: '3', status: 'Killed', line: 3, column: 8 }),
			],
		})
		const killedKey = judgeReport({
			report: report({ mutants: [mutant({ id: '3', status: 'Survived', line: 3, column: 8 })] }),
			records: {},
		}).survivors[0]?.key as string
		const records: EquivalentMutants = {
			...recorded({ keys: [FIRST_KEY, killedKey] }),
			[OTHER]: { k: { line: 9, mutation: 'm', equivalent: 'other reason' } },
		}
		const verdict = judgeReport({ report: second, records })
		expect(recordSurvivors({ records, verdict })).toEqual({
			[FILE]: {
				[FIRST_KEY]: {
					line: 1,
					mutation: 'ConditionalExpression: x === 1 -> true',
					equivalent: 'x is always 1 here',
				},
				[`${FIRST_KEY}-1`]: {
					line: 2,
					mutation: 'ConditionalExpression: x === 1 -> true',
					equivalent: '',
				},
			},
			[OTHER]: { k: { line: 9, mutation: 'm', equivalent: 'other reason' } },
		})
	})
})

describe('withinTargets', () => {
	it('an incremental report also holds earlier runs → cut to the files and ranges asked for', () => {
		const incremental: MutationReport = {
			files: {
				[FILE]: {
					source: SOURCE,
					mutants: [
						mutant({ id: '1', status: 'Killed', line: 1 }),
						mutant({ id: '2', status: 'Survived', line: 2 }),
					],
				},
				[OTHER]: { source: SOURCE, mutants: [mutant({ id: '3', status: 'Survived', line: 1 })] },
			},
		}
		const cut = withinTargets({
			report: incremental,
			targets: [parseTarget({ target: `${FILE}:2-2` })],
		})
		expect(Object.keys(cut.files)).toEqual([FILE])
		expect(statuses({ report: cut })).toEqual(['Survived'])
	})

	it("a survivor's own range → holds that survivor", () => {
		const one = mutant({ id: '1', status: 'Survived', line: 1 })
		const cut = withinTargets({
			report: report({ mutants: [one] }),
			targets: [parseTarget({ target: exactRange({ file: FILE, mutant: one }) })],
		})
		expect(statuses({ report: cut })).toEqual(['Survived'])
	})
})

describe('withLoneTimeouts', () => {
	it.each([
		['killed alone → killed', 'Killed', 'Killed'],
		['survives alone → a survivor', 'Survived', 'Survived'],
		['times out again → a timeout', 'Timeout', 'Timeout'],
	])('a timed-out mutant that %s', (_label, alone, expected) => {
		const merged = withLoneTimeouts({
			report: report({
				mutants: [
					mutant({ id: '1', status: 'Timeout', line: 1 }),
					mutant({ id: '2', status: 'Survived', line: 2 }),
				],
			}),
			alone: report({ mutants: [mutant({ id: '9', status: alone, line: 1 })] }),
		})
		expect(statuses({ report: merged })).toEqual([expected, 'Survived'])
	})
})

describe('withFullRun', () => {
	it('a survivor the browser tier kills → killed; one it does not → still a survivor', () => {
		const merged = withFullRun({
			fast: report({
				mutants: [
					mutant({ id: '1', status: 'Survived', line: 1 }),
					mutant({ id: '2', status: 'NoCoverage', line: 2 }),
					mutant({ id: '3', status: 'Killed', line: 3, column: 8 }),
				],
			}),
			full: report({
				mutants: [
					mutant({ id: '7', status: 'Killed', line: 1 }),
					mutant({ id: '8', status: 'Survived', line: 2 }),
				],
			}),
		})
		expect(statuses({ report: merged })).toEqual(['Killed', 'NoCoverage', 'Killed'])
	})
})

describe('exactRange', () => {
	it('the report counts columns from 1, --mutate counts the start column from 0', () => {
		const one = mutant({ id: '1', status: 'Survived', line: 3, column: 5 })
		expect(exactRange({ file: FILE, mutant: one })).toBe(`${FILE}:3:4-3:12`)
	})
})

describe('diffRanges', () => {
	const DIFF = [
		'diff --git a/src/a.ts b/src/a.ts',
		'--- a/src/a.ts',
		'+++ b/src/a.ts',
		'@@ -10,0 +11,3 @@ function a() {',
		'+one',
		'+++ b/src/content.ts',
		'@@ -20 +23 @@',
		'+two',
		'@@ -30,2 +33,0 @@',
		'-gone',
		'diff --git a/src/a b.ts b/src/a b.ts',
		'--- a/src/a b.ts\t',
		'+++ b/src/a b.ts\t',
		'@@ -1,0 +2,1 @@',
		'+spaced',
		...['src/a.test.ts', 'src/b.types.ts', 'src/v2019C1/definition/d.generated.ts']
			.concat(['src/v2019C1/test/fixtures/x/y.ts', 'src/v2019C1/test/s.setup.ts'])
			.flatMap((path) => [
				`diff --git a/${path} b/${path}`,
				`--- a/${path}`,
				`+++ b/${path}`,
				'@@ -1,0 +2,1 @@',
			]),
		'diff --git a/src/gone.ts b/src/gone.ts',
		'--- a/src/gone.ts',
		'+++ /dev/null',
		'@@ -1,3 +0,0 @@',
	].join('\n')

	it('the added and changed lines of the source files, the untracked source files whole', () => {
		expect(
			diffRanges({ diff: DIFF, untracked: ['src/new.ts', 'src/new.test.ts', 'README.md'] }),
		).toEqual(['src/a.ts:11-13', 'src/a.ts:23-23', 'src/a b.ts:2-2', 'src/new.ts'])
	})
})
